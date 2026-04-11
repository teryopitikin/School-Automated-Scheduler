"""
WSGI config for AutomatedLoader project.
"""
import os

from django.core.wsgi import get_wsgi_application

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'loader.settings')

application = get_wsgi_application()
