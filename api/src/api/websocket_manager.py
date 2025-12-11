import json
import logging
import asyncio
import os
import uuid
from typing import Dict, Optional, Any, Set
from datetime import datetime
from fastapi import WebSocket
import aio_pika
from aio_pika import Message, ExchangeType

logger = logging.getLogger(__name__)
RABBITMQ_URL = os.getenv("CELERY_BROKER_URL", "amqp://guest:guest@localhost:5672/")

class WebSocketManager:
    def __init__(self, rabbitmq_url: str = None):
        self.active_connections: Dict[str, WebSocket] = {}
        self.rabbitmq_url = rabbitmq_url or RABBITMQ_URL
        self.connection: Optional[aio_pika.Connection] = None
        self.channel: Optional[aio_pika.Channel] = None
        self.debate_exchange: Optional[aio_pika.Exchange] = None
        self.human_response_exchange: Optional[aio_pika.Exchange] = None
        self.consumer_tasks: Dict[str, asyncio.Task] = {}
        self._closing = False
        self.queues_to_cleanup: Set[str] = set()
        self.active_consumers: Dict[str, str] = {}
        logger.info(f"WebSocketManager initialized with RabbitMQ URL: {self.rabbitmq_url}")

    async def initialize(self):
        if self._closing:
            return
            
        if self.connection is None or self.connection.is_closed:
            try:
                self.connection = await aio_pika.connect_robust(
                    self.rabbitmq_url,
                    heartbeat=60,
                    blocked_connection_timeout=300
                )
                self.channel = await self.connection.channel()
                await self.channel.set_qos(prefetch_count=1)
                
                self.debate_exchange = await self.channel.declare_exchange(
                    'debate_events',
                    ExchangeType.TOPIC,
                    durable=False
                )
                
                self.human_response_exchange = await self.channel.declare_exchange(
                    'human_responses',
                    ExchangeType.DIRECT,
                    durable=True
                )
                
                logger.info("RabbitMQ connection initialized for WebSocket manager")
            except Exception as e:
                logger.error(f"Failed to initialize RabbitMQ: {e}")
                raise

    async def close(self):
        self._closing = True
        logger.info("Starting WebSocket manager shutdown...")
        
        cancel_tasks = []
        for task in self.consumer_tasks.values():
            if not task.done():
                task.cancel()
                cancel_tasks.append(task)
        
        if cancel_tasks:
            await asyncio.gather(*cancel_tasks, return_exceptions=True)
        
        self.consumer_tasks.clear()
        self.active_consumers.clear()
        
        close_ws_tasks = [ws.close() for ws in self.active_connections.values()]
        if close_ws_tasks:
            await asyncio.gather(*close_ws_tasks, return_exceptions=True)
        self.active_connections.clear()
        
        if self.channel and not self.channel.is_closed:
            cleanup_queue_tasks = []
            for queue_name in self.queues_to_cleanup:
                cleanup_queue_tasks.append(
                    self.channel.queue_delete(queue_name, if_empty=False, if_unused=False)
                )
            if cleanup_queue_tasks:
                await asyncio.gather(*cleanup_queue_tasks, return_exceptions=True)
        
        self.queues_to_cleanup.clear()
        
        if self.channel and not self.channel.is_closed:
            await self.channel.close()
        
        if self.connection and not self.connection.is_closed:
            await self.connection.close()
        
        self.connection = None
        self.channel = None
        logger.info("WebSocket manager shutdown complete")

    async def connect(self, websocket: WebSocket, debate_id: str, consumer_ready_event: asyncio.Event = None):
        if self._closing:
            await websocket.close()
            return
        
        if debate_id in self.consumer_tasks:
            await self._cleanup_consumer(debate_id)
        
        self.active_connections[debate_id] = websocket
        
        consumer_task = asyncio.create_task(
            self._consume_debate_events(debate_id, websocket, consumer_ready_event),
            name=f"consumer_{debate_id}"
        )
        self.consumer_tasks[debate_id] = consumer_task

    async def _consume_debate_events(
        self, 
        debate_id: str, 
        websocket: WebSocket,
        consumer_ready_event: asyncio.Event = None
    ):
        queue_name = f'ws_events_{debate_id}'
        consumer_tag = f'ws_consumer_{debate_id}_{uuid.uuid4().hex[:8]}'
        queue = None
        
        try:
            await self.initialize()
            self.active_consumers[debate_id] = consumer_tag
            
            queue = await self.channel.declare_queue(
                queue_name,
                durable=True,
                auto_delete=False, 
                exclusive=False,
                arguments={
                    'x-message-ttl': 300000,
                    'x-expires': 600000
                }
            )
            
            self.queues_to_cleanup.add(queue_name)
            await queue.bind(self.debate_exchange, routing_key=f'debate.events.{debate_id}')
            
            if consumer_ready_event:
                consumer_ready_event.set()
            
            async with queue.iterator(consumer_tag=consumer_tag) as queue_iter:
                async for message in queue_iter:
                    if self._closing:
                        break
                        
                    async with message.process():
                        try:
                            event_data = json.loads(message.body.decode())
                            if debate_id not in self.active_connections:
                                break
                            
                            await websocket.send_json(event_data)
                            
                            if event_data.get('type') in ['debate_completed', 'debate_failed', 'debate_cancelled']:
                                break
                                
                        except Exception:
                            break
                            
        except asyncio.CancelledError:
            raise
        except Exception as e:
            if consumer_ready_event and not consumer_ready_event.is_set():
                consumer_ready_event.set()
            
            if debate_id in self.active_connections:
                try:
                    await websocket.send_json({"type": "error", "message": str(e)})
                except:
                    pass
        finally:
            if debate_id in self.active_consumers:
                del self.active_consumers[debate_id]
            
            if self.channel and not self.channel.is_closed:
                try:
                    if queue:
                        await queue.cancel(consumer_tag)
                    await self.channel.queue_delete(queue_name, if_empty=False, if_unused=False)
                    self.queues_to_cleanup.discard(queue_name)
                except Exception:
                    pass

    def disconnect(self, debate_id: str):
        if debate_id in self.active_connections:
            del self.active_connections[debate_id]
        asyncio.create_task(self._cleanup_consumer(debate_id))

    async def _cleanup_consumer(self, debate_id: str):
        if debate_id in self.consumer_tasks:
            task = self.consumer_tasks[debate_id]
            if not task.done():
                task.cancel()
                try:
                    await task
                except asyncio.CancelledError:
                    pass
            del self.consumer_tasks[debate_id]
        
        if debate_id in self.active_consumers:
            del self.active_consumers[debate_id]
        
        queue_name = f'ws_events_{debate_id}'
        if self.channel and not self.channel.is_closed:
            try:
                await self.channel.queue_delete(queue_name, if_empty=False, if_unused=False)
                self.queues_to_cleanup.discard(queue_name)
            except Exception:
                pass

    def is_connected(self, debate_id: str) -> bool:
        return debate_id in self.active_connections and not self._closing
    
    def get_connection_count(self) -> int:
        return len(self.active_connections)

    async def store_human_response(
        self,
        debate_id: str,
        response_text: str,
        extracted_answer: Optional[str] = None
    ):
        if self._closing:
            raise RuntimeError("WebSocket manager is closing")
            
        await self.initialize()
        
        response_data = {
            "response_text": response_text,
            "extracted_answer": extracted_answer,
            "timestamp": datetime.utcnow().isoformat()
        }
        
        message = Message(
            body=json.dumps(response_data).encode(),
            content_type='application/json',
            delivery_mode=aio_pika.DeliveryMode.PERSISTENT
        )
        
        await self.human_response_exchange.publish(
            message,
            routing_key=debate_id
        )

    async def send_human_ready_signal(self, debate_id: str):
        if self._closing:
            raise RuntimeError("WebSocket manager is closing")
            
        await self.initialize()
        
        message = Message(
            body=json.dumps({
                "ready": True,
                "timestamp": datetime.utcnow().isoformat()
            }).encode(),
            content_type='application/json',
            delivery_mode=aio_pika.DeliveryMode.PERSISTENT
        )
        
        await self.human_response_exchange.publish(
            message,
            routing_key=f"{debate_id}_ready"
        )

_ws_manager: Optional[WebSocketManager] = None
_worker_connection: Optional[aio_pika.Connection] = None
_worker_channel: Optional[aio_pika.Channel] = None
_worker_exchange: Optional[aio_pika.Exchange] = None

def get_ws_manager(rabbitmq_url: str = None) -> WebSocketManager:
    global _ws_manager
    if _ws_manager is None:
        _ws_manager = WebSocketManager(rabbitmq_url)
    return _ws_manager

async def broadcast_to_debate(debate_id: str, event_data: Dict[str, Any]):
    global _worker_connection, _worker_channel, _worker_exchange
    
    try:
        if _worker_connection is None or _worker_connection.is_closed:
            _worker_connection = await aio_pika.connect_robust(
                RABBITMQ_URL,
                heartbeat=60,
                blocked_connection_timeout=30
            )
            _worker_channel = await _worker_connection.channel()
            _worker_exchange = await _worker_channel.declare_exchange(
                'debate_events',
                ExchangeType.TOPIC,
                durable=False
            )
        
        if _worker_exchange is None:
             _worker_exchange = await _worker_channel.declare_exchange(
                'debate_events',
                ExchangeType.TOPIC,
                durable=False
            )

        message = Message(
            body=json.dumps(event_data).encode(),
            content_type='application/json',
            delivery_mode=aio_pika.DeliveryMode.NOT_PERSISTENT
        )
        
        await _worker_exchange.publish(message, routing_key=f'debate.events.{debate_id}')
        
    except Exception as e:
        logger.error(f"Failed to broadcast event to debate {debate_id}: {e}")
        _worker_connection = None
        _worker_channel = None
        _worker_exchange = None