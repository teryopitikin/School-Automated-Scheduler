from django.contrib import admin
from django.urls import include, path

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/loader/', include('apps.core.urls')),
    path('api/loader/', include('apps.scheduling.urls')),
]
