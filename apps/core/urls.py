from django.urls import path

from . import views

urlpatterns = [
    path('auth/login/', views.login_view, name='login'),
    path('auth/logout/', views.logout_view, name='logout'),
    path('auth/me/', views.current_user_view, name='current-user'),
    path('auth/csrf/', views.csrf_view, name='csrf'),
]
