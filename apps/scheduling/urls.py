from django.urls import include, path
from rest_framework.routers import DefaultRouter

from . import assistant_views, views
from .views import import_excel_view, export_excel_view

router = DefaultRouter()
router.register(r'academic-periods', views.AcademicPeriodViewSet, basename='academic-period')
router.register(r'programs', views.ProgramViewSet, basename='program')
router.register(r'departments', views.DepartmentViewSet, basename='department')
router.register(r'courses', views.CourseViewSet, basename='course')
router.register(r'sections', views.SectionViewSet, basename='section')
router.register(r'faculty', views.FacultyViewSet, basename='faculty')
router.register(r'rooms', views.RoomViewSet, basename='room')
router.register(r'schedules', views.ScheduleEntryViewSet, basename='schedule')
router.register(r'config', views.ScheduleConfigViewSet, basename='config')

faculty_availability_list = views.FacultyAvailabilityViewSet.as_view({
    'get': 'list', 'post': 'create',
})
faculty_availability_detail = views.FacultyAvailabilityViewSet.as_view({
    'get': 'retrieve', 'put': 'update', 'patch': 'partial_update', 'delete': 'destroy',
})

urlpatterns = [
    path('', include(router.urls)),
    path('faculty/<int:faculty_pk>/availability/', faculty_availability_list, name='faculty-availability-list'),
    path('faculty/<int:faculty_pk>/availability/<int:pk>/', faculty_availability_detail, name='faculty-availability-detail'),
    path('import/', import_excel_view, name='import-excel'),
    path('export/', export_excel_view, name='export-excel'),
    path('assistant/chat/', assistant_views.assistant_chat, name='assistant-chat'),
    path('assistant/execute/', assistant_views.assistant_execute, name='assistant-execute'),
    path('assistant/config/', assistant_views.assistant_config, name='assistant-config'),
    path('assistant/config/test/', assistant_views.assistant_config_test, name='assistant-config-test'),
]
