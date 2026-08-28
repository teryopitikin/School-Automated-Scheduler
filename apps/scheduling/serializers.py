from rest_framework import serializers

from .models import (
    AcademicPeriod, Program, Department, Course, Section,
    Faculty, FacultyAvailability, Room, ScheduleEntry, ScheduleConfig,
)


class AcademicPeriodSerializer(serializers.ModelSerializer):
    class Meta:
        model = AcademicPeriod
        fields = ['id', 'name', 'year_start', 'year_end', 'semester', 'status', 'created_at', 'updated_at']
        read_only_fields = ['created_at', 'updated_at']


class ProgramSerializer(serializers.ModelSerializer):
    class Meta:
        model = Program
        fields = ['id', 'code', 'name', 'created_at']
        read_only_fields = ['created_at']


class DepartmentSerializer(serializers.ModelSerializer):
    class Meta:
        model = Department
        fields = ['id', 'code', 'name', 'created_at']
        read_only_fields = ['created_at']


class CourseSerializer(serializers.ModelSerializer):
    total_units = serializers.DecimalField(max_digits=5, decimal_places=1, read_only=True)
    department_name = serializers.CharField(source='department.name', read_only=True)

    class Meta:
        model = Course
        fields = [
            'id', 'department', 'department_name', 'code', 'title',
            'lec_units', 'lab_units', 'total_units', 'contact_hours',
            'has_lab', 'created_at',
        ]
        read_only_fields = ['created_at']


class SectionSerializer(serializers.ModelSerializer):
    display_name = serializers.CharField(source='__str__', read_only=True)
    program_code = serializers.CharField(source='program.code', read_only=True)

    class Meta:
        model = Section
        fields = [
            'id', 'program', 'program_code', 'academic_period',
            'year_level', 'section_number', 'display_name', 'created_at',
        ]
        read_only_fields = ['created_at']


class FacultyAvailabilitySerializer(serializers.ModelSerializer):
    class Meta:
        model = FacultyAvailability
        fields = ['id', 'academic_period', 'day_of_week', 'time_start', 'time_end', 'availability_type']


class FacultySerializer(serializers.ModelSerializer):
    class Meta:
        model = Faculty
        fields = [
            'id', 'name', 'employment_type', 'priority_level',
            'max_load_units', 'created_at',
        ]
        read_only_fields = ['created_at']


class RoomSerializer(serializers.ModelSerializer):
    class Meta:
        model = Room
        fields = [
            'id', 'name', 'room_type', 'capacity', 'building',
            'floor', 'sequence_number', 'created_at',
        ]
        read_only_fields = ['created_at']


class ScheduleEntrySerializer(serializers.ModelSerializer):
    course_code = serializers.CharField(source='course.code', read_only=True)
    course_title = serializers.CharField(source='course.title', read_only=True)
    course_department_code = serializers.CharField(
        source='course.department.code', read_only=True, default='')
    faculty_name = serializers.CharField(source='faculty.name', read_only=True, default='TBA')
    room_name = serializers.CharField(source='room.name', read_only=True)
    section_names = serializers.SerializerMethodField()

    class Meta:
        model = ScheduleEntry
        fields = [
            'id', 'academic_period', 'course', 'course_code', 'course_title',
            'course_department_code',
            'faculty', 'faculty_name', 'room', 'room_name',
            'sections', 'section_names',
            'day_of_week', 'time_start', 'time_end',
            'group_id', 'entry_type', 'load_classification',
            'class_size', 'faculty_credits', 'remarks',
            'linked_entry', 'created_at', 'updated_at',
        ]
        read_only_fields = ['created_at', 'updated_at']

    def get_section_names(self, obj):
        return [str(s) for s in obj.sections.all()]


class ScheduleConfigSerializer(serializers.ModelSerializer):
    class Meta:
        model = ScheduleConfig
        fields = [
            'id', 'academic_period',
            'earliest_start_time', 'latest_end_time',
            'time_slot_granularity_minutes', 'operating_days', 'break_periods',
            'weight_faculty_priority', 'weight_room_proximity',
            'weight_time_gap_minimization', 'weight_load_distribution',
        ]
