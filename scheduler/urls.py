from django.contrib import admin
from django.urls import include, path

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/scheduler/', include('apps.core.urls')),
    path('api/scheduler/', include('apps.scheduling.urls')),
]
