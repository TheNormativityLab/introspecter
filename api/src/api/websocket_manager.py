# src/api/websocket_manager.py - Fixed version
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
        self.active_consumers: Dict[str, str] = {}  # debate_id -> consumer_tag
        
        logger.info(f"WebSocketManager initialized with RabbitMQ URL: {self.rabbitmq_url}")
    
    async def initialize(self):
        """Initialize RabbitMQ connection."""
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
                await self.channel.set_qos(prefetch_count=10)
                
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
        """Close all consumer tasks and RabbitMQ connection gracefully."""
        self._closing = True
        logger.info("Starting WebSocket manager shutdown...")
        
        cancel_tasks = []
        for debate_id, task in list(self.consumer_tasks.items()):
            if not task.done():
                task.cancel()
                cancel_tasks.append(task)
        
        if cancel_tasks:
            results = await asyncio.gather(*cancel_tasks, return_exceptions=True)
            for i, result in enumerate(results):
                if isinstance(result, asyncio.CancelledError):
                    logger.debug(f"Consumer task {i} cancelled successfully")
                elif isinstance(result, Exception):
                    logger.warning(f"Consumer task {i} raised exception: {result}")
        
        self.consumer_tasks.clear()
        self.active_consumers.clear()
        
        for debate_id, ws in list(self.active_connections.items()):
            try:
                await ws.close()
            except Exception as e:
                logger.debug(f"Error closing WebSocket for {debate_id}: {e}")
        
        self.active_connections.clear()
        
        if self.channel and not self.channel.is_closed:
            for queue_name in list(self.queues_to_cleanup):
                try:
                    await self.channel.queue_delete(queue_name, if_empty=False, if_unused=False)
                    logger.debug(f"Cleaned up queue {queue_name}")
                except Exception as e:
                    logger.debug(f"Queue cleanup error for {queue_name}: {e}")
        
        self.queues_to_cleanup.clear()
        
        try:
            if self.channel and not self.channel.is_closed:
                await self.channel.close()
        except Exception as e:
            logger.debug(f"Error closing channel: {e}")
        
        try:
            if self.connection and not self.connection.is_closed:
                await self.connection.close()
        except Exception as e:
            logger.debug(f"Error closing connection: {e}")
        
        self.connection = None
        self.channel = None
        logger.info("WebSocket manager shutdown complete")
    
    async def connect(self, websocket: WebSocket, debate_id: str, consumer_ready_event: asyncio.Event = None):
        """
        Register a new WebSocket connection and start consuming events.
        
        Args:
            websocket: The WebSocket connection
            debate_id: The debate ID
            consumer_ready_event: Optional event to signal when consumer is ready
        """
        if self._closing:
            logger.warning(f"Cannot connect WebSocket for {debate_id} - manager is closing")
            await websocket.close()
            return
        
        if debate_id in self.consumer_tasks:
            logger.warning(f"Cleaning up existing consumer for debate {debate_id}")
            await self._cleanup_consumer(debate_id)
        
        # Store the connection
        self.active_connections[debate_id] = websocket
        
        # Start consumer task with ready signal
        consumer_task = asyncio.create_task(
            self._consume_debate_events(debate_id, websocket, consumer_ready_event),
            name=f"consumer_{debate_id}"
        )
        self.consumer_tasks[debate_id] = consumer_task
        
        logger.info(f"WebSocket connected for debate {debate_id}, consumer starting")


    async def _consume_debate_events(
        self, 
        debate_id: str, 
        websocket: WebSocket,
        consumer_ready_event: asyncio.Event = None
    ):
        """
        Consume events from RabbitMQ for a specific debate and forward to WebSocket.
        
        Args:
            debate_id: The debate ID
            websocket: The WebSocket connection
            consumer_ready_event: Event to signal when consumer is fully initialized
        """
        queue = None
        queue_name = f'ws_events_{debate_id}'
        consumer_tag = f'ws_consumer_{debate_id}_{uuid.uuid4().hex[:8]}'
        
        logger.info(f"Starting consumer for debate {debate_id} with tag: {consumer_tag}")
        
        try:
            await self.initialize()
            
            self.active_consumers[debate_id] = consumer_tag
            
            # Declare queue with proper settings
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
            
            # Bind to exchange
            routing_key = f'debate.events.{debate_id}'
            await queue.bind(self.debate_exchange, routing_key=routing_key)
            
            logger.info(f"Queue {queue_name} declared and bound for debate {debate_id}")
            
            if consumer_ready_event:
                consumer_ready_event.set()
                logger.info(f"Consumer ready signal sent for debate {debate_id}")
            
            # Now start consuming messages
            async with queue.iterator(consumer_tag=consumer_tag) as queue_iter:
                async for message in queue_iter:
                    if self._closing:
                        logger.info(f"Stopping consumer for debate {debate_id} - manager closing")
                        break
                        
                    async with message.process():
                        try:
                            event_data = json.loads(message.body.decode())
                            event_type = event_data.get('type', 'unknown')
                            
                            if debate_id not in self.active_connections:
                                logger.info(f"WebSocket disconnected for {debate_id}, stopping consumer")
                                break
                            
                            await websocket.send_json(event_data)
                            
                            logger.info(f"Forwarded {event_type} event to WebSocket for debate {debate_id}")
                            
                            if event_type in ['debate_completed', 'debate_failed', 'debate_cancelled']:
                                logger.info(f"Debate {debate_id} ended ({event_type}), stopping consumer")
                                break
                                
                        except json.JSONDecodeError as e:
                            logger.error(f"Failed to decode event message: {e}")
                        except Exception as e:
                            logger.error(f"Error forwarding event: {e}", exc_info=True)
                            break
                            
        except asyncio.CancelledError:
            logger.info(f"Event consumer cancelled for debate {debate_id} (tag: {consumer_tag})")
            raise
        except Exception as e:
            logger.error(f"Error in event consumer for debate {debate_id}: {e}", exc_info=True)
            
            # Signal error if we failed before signaling ready
            if consumer_ready_event and not consumer_ready_event.is_set():
                consumer_ready_event.set()
            
            try:
                if debate_id in self.active_connections:
                    await websocket.send_json({
                        "type": "error",
                        "message": f"Consumer error: {str(e)}"
                    })
            except:
                pass
        finally:
            if debate_id in self.active_consumers:
                del self.active_consumers[debate_id]
            
            if self.channel and not self.channel.is_closed:
                try:
                    if queue:
                        await queue.cancel(consumer_tag)
                        logger.debug(f"Cancelled consumer {consumer_tag}")
                except Exception as e:
                    logger.debug(f"Consumer cancel: {e}")
                
                try:
                    await self.channel.queue_delete(queue_name, if_empty=False, if_unused=False)
                    self.queues_to_cleanup.discard(queue_name)
                    logger.debug(f"Cleaned up queue {queue_name} for debate {debate_id}")
                except Exception as e:
                    logger.debug(f"Queue cleanup: {e}")
        
    def disconnect(self, debate_id: str):
        """Remove a WebSocket connection and stop consumer."""
        if debate_id in self.active_connections:
            del self.active_connections[debate_id]
        
        asyncio.create_task(self._cleanup_consumer(debate_id))
        
        logger.info(f"WebSocket disconnected for debate {debate_id}")
    
    async def _cleanup_consumer(self, debate_id: str):
        """Clean up consumer task and queue for a debate."""
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
                logger.debug(f"Cleaned up queue {queue_name}")
            except Exception as e:
                logger.debug(f"Queue cleanup error: {e}")
    
    def is_connected(self, debate_id: str) -> bool:
        """Check if WebSocket is connected for debate."""
        return debate_id in self.active_connections and not self._closing
    
    def get_connection_count(self) -> int:
        """Get number of active WebSocket connections."""
        return len(self.active_connections)
    
    
    async def store_human_response(
        self,
        debate_id: str,
        response_text: str,
        extracted_answer: Optional[str] = None
    ):
        """Store human response in RabbitMQ for Celery worker to retrieve."""
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
        
        logger.info(f"Published human response to RabbitMQ for debate {debate_id}")
        logger.debug(f"   Response: {response_text[:100]}...")
        logger.debug(f"   Extracted: {extracted_answer}")


    async def send_human_ready_signal(self, debate_id: str):
        """Signal that human participant is connected and ready."""
        if self._closing:
            raise RuntimeError("WebSocket manager is closing")
            
        await self.initialize()
        
        ready_signal = {
            "ready": True,
            "timestamp": datetime.utcnow().isoformat()
        }
        
        message = Message(
            body=json.dumps(ready_signal).encode(),
            content_type='application/json',
            delivery_mode=aio_pika.DeliveryMode.PERSISTENT
        )
        
        await self.human_response_exchange.publish(
            message,
            routing_key=f"{debate_id}_ready"
        )
        
        logger.info(f"Published human ready signal for debate {debate_id}")

_ws_manager: Optional[WebSocketManager] = None


def get_ws_manager(rabbitmq_url: str = None) -> WebSocketManager:
    """Get or create the global WebSocket manager instance."""
    global _ws_manager
    if _ws_manager is None:
        _ws_manager = WebSocketManager(rabbitmq_url)
    return _ws_manager


# Celery worker broadcasting function
async def broadcast_to_debate(debate_id: str, event_data: Dict[str, Any]):
    """Broadcast an event from Celery workers to WebSocket clients."""
    connection = None
    channel = None
    
    try:
        rabbitmq_url = RABBITMQ_URL
        
        connection = await aio_pika.connect_robust(
            rabbitmq_url,
            heartbeat=60,
            blocked_connection_timeout=30
        )
        channel = await connection.channel()
        
        debate_exchange = await channel.declare_exchange(
            'debate_events',
            ExchangeType.TOPIC,
            durable=False
        )
        
        message = Message(
            body=json.dumps(event_data).encode(),
            content_type='application/json',
            delivery_mode=aio_pika.DeliveryMode.NOT_PERSISTENT
        )
        
        routing_key = f'debate.events.{debate_id}'
        await debate_exchange.publish(message, routing_key=routing_key)
        
        logger.debug(f"Broadcasted {event_data.get('type')} to debate {debate_id}")
        
    except Exception as e:
        logger.error(f"Failed to broadcast event to debate {debate_id}: {e}")
        
    finally:
        try:
            if channel and not channel.is_closed:
                await channel.close()
        except Exception as e:
            logger.debug(f"Error closing channel: {e}")
        
        try:
            if connection and not connection.is_closed:
                await connection.close()
        except Exception as e:
            logger.debug(f"Error closing connection: {e}")