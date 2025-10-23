# api/src/api/celery_app.py
from celery import Celery
import os
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

broker_url = os.getenv(
    'CELERY_BROKER_URL',
    'amqp://guest:guest@introspecter-rabbitmq:5672//'
)
result_backend = os.getenv('CELERY_RESULT_BACKEND', 'rpc://')

logger.info(f"Initializing Celery with broker: {broker_url}")

celery_app = Celery(
    'debate_tasks',
    broker=broker_url,
    backend=result_backend,
    include=['src.api.tasks']
)

celery_app.conf.update(
    task_serializer='json',
    accept_content=['json'],
    result_serializer='json',
    timezone='UTC',
    enable_utc=True,
    worker_concurrency=10,
    task_track_started=True,
    task_time_limit=3600,
    task_soft_time_limit=3000,
    worker_prefetch_multiplier=1,
    worker_max_tasks_per_child=50,
    beat_schedule_filename=os.getenv(
        'CELERY_BEAT_SCHEDULE',
        '/app/data/celerybeat-schedule.db'
    ),
    broker_connection_retry_on_startup=True,
    broker_connection_retry=True,
    broker_pool_limit=None, 
)

logger.info("Celery app configured successfully (using default prefork pool)")