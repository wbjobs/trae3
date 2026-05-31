"""
ASGI config for water_pipeline project.
"""
import os
from django.core.asgi import get_asgi_application

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'water_pipeline.settings')
application = get_asgi_application()
