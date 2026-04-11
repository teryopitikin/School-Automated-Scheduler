import uuid

from django.db import models


class AcademicPeriod(models.Model):
    class Semester(models.TextChoices):
        FIRST = '1ST', '1st Semester'
        SECOND = '2ND', '2nd Semester'
        SUMMER = 'SUMMER', 'Summer'

    class Status(models.TextChoices):
        DRAFT = 'DRAFT', 'Draft'
        ACTIVE = 'ACTIVE', 'Active'
        ARCHIVED = 'ARCHIVED', 'Archived'

    tenant = models.ForeignKey('core.Tenant', on_delete=models.CASCADE, related_name='academic_periods')
    name = models.CharField(max_length=255)
    year_start = models.PositiveSmallIntegerField()
    year_end = models.PositiveSmallIntegerField()
    semester = models.CharField(max_length=10, choices=Semester.choices)
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.DRAFT)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'scheduling_academic_periods'
        unique_together = [('tenant', 'year_start', 'year_end', 'semester')]
        ordering = ['-year_start', '-year_end', 'semester']

    def __str__(self):
        return self.name


class Program(models.Model):
    tenant = models.ForeignKey('core.Tenant', on_delete=models.CASCADE, related_name='programs')
    code = models.CharField(max_length=30)
    name = models.CharField(max_length=255)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'scheduling_programs'
        unique_together = [('tenant', 'code')]
        ordering = ['code']

    def __str__(self):
        return self.code


class Department(models.Model):
    tenant = models.ForeignKey('core.Tenant', on_delete=models.CASCADE, related_name='departments')
    code = models.CharField(max_length=30)
    name = models.CharField(max_length=255)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'scheduling_departments'
        unique_together = [('tenant', 'code')]
        ordering = ['code']

    def __str__(self):
        return self.code


class Course(models.Model):
    tenant = models.ForeignKey('core.Tenant', on_delete=models.CASCADE, related_name='courses')
    department = models.ForeignKey(Department, on_delete=models.CASCADE, related_name='courses')
    code = models.CharField(max_length=30)
    title = models.CharField(max_length=255)
    lec_units = models.DecimalField(max_digits=4, decimal_places=1, default=0)
    lab_units = models.DecimalField(max_digits=4, decimal_places=1, default=0)
    contact_hours = models.DecimalField(max_digits=4, decimal_places=1, default=0)
    has_lab = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'scheduling_courses'
        unique_together = [('tenant', 'code')]
        ordering = ['code']

    @property
    def total_units(self):
        return self.lec_units + self.lab_units

    def __str__(self):
        return self.code


class Section(models.Model):
    tenant = models.ForeignKey('core.Tenant', on_delete=models.CASCADE, related_name='sections')
    program = models.ForeignKey(Program, on_delete=models.CASCADE, related_name='sections')
    academic_period = models.ForeignKey(AcademicPeriod, on_delete=models.CASCADE, related_name='sections')
    year_level = models.PositiveSmallIntegerField()
    section_number = models.PositiveSmallIntegerField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'scheduling_sections'
        unique_together = [('tenant', 'program', 'academic_period', 'year_level', 'section_number')]
        ordering = ['program__code', 'year_level', 'section_number']

    def __str__(self):
        return f'{self.program.code} {self.year_level}-{self.section_number}'


class Faculty(models.Model):
    class EmploymentType(models.TextChoices):
        FULL_TIME = 'FULL_TIME', 'Full-Time'
        PART_TIME = 'PART_TIME', 'Part-Time'

    tenant = models.ForeignKey('core.Tenant', on_delete=models.CASCADE, related_name='faculty_members')
    name = models.CharField(max_length=255)
    employment_type = models.CharField(max_length=20, choices=EmploymentType.choices)
    priority_level = models.PositiveSmallIntegerField(default=0)
    max_load_units = models.DecimalField(max_digits=5, decimal_places=1, default=24)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'scheduling_faculty'
        unique_together = [('tenant', 'name')]
        ordering = ['name']
        verbose_name_plural = 'faculty'

    def __str__(self):
        return self.name


class FacultyAvailability(models.Model):
    class DayOfWeek(models.TextChoices):
        MON = 'MON', 'Monday'
        TUE = 'TUE', 'Tuesday'
        WED = 'WED', 'Wednesday'
        THU = 'THU', 'Thursday'
        FRI = 'FRI', 'Friday'
        SAT = 'SAT', 'Saturday'
        SUN = 'SUN', 'Sunday'

    class AvailabilityType(models.TextChoices):
        AVAILABLE = 'AVAILABLE', 'Available'
        PREFERRED = 'PREFERRED', 'Preferred'
        UNAVAILABLE = 'UNAVAILABLE', 'Unavailable'

    faculty = models.ForeignKey(Faculty, on_delete=models.CASCADE, related_name='availability_slots')
    academic_period = models.ForeignKey(AcademicPeriod, on_delete=models.CASCADE, related_name='faculty_availability')
    day_of_week = models.CharField(max_length=3, choices=DayOfWeek.choices)
    time_start = models.TimeField()
    time_end = models.TimeField()
    availability_type = models.CharField(max_length=15, choices=AvailabilityType.choices, default=AvailabilityType.AVAILABLE)

    class Meta:
        db_table = 'scheduling_faculty_availability'
        verbose_name_plural = 'faculty availability'

    def __str__(self):
        return f'{self.faculty.name} — {self.day_of_week} {self.time_start}-{self.time_end}'


class Room(models.Model):
    class RoomType(models.TextChoices):
        LECTURE = 'LECTURE', 'Lecture'
        LABORATORY = 'LABORATORY', 'Laboratory'
        COMPUTER_LAB = 'COMPUTER_LAB', 'Computer Lab'
        AVR = 'AVR', 'AVR'
        OTHER = 'OTHER', 'Other'

    tenant = models.ForeignKey('core.Tenant', on_delete=models.CASCADE, related_name='rooms')
    name = models.CharField(max_length=100)
    room_type = models.CharField(max_length=20, choices=RoomType.choices)
    capacity = models.PositiveSmallIntegerField(default=0)
    building = models.CharField(max_length=100, blank=True, default='')
    floor = models.PositiveSmallIntegerField(default=1)
    sequence_number = models.PositiveSmallIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'scheduling_rooms'
        unique_together = [('tenant', 'name')]
        ordering = ['building', 'floor', 'sequence_number', 'name']

    def __str__(self):
        return self.name


class ScheduleEntry(models.Model):
    class DayOfWeek(models.TextChoices):
        MON = 'MON', 'Monday'
        TUE = 'TUE', 'Tuesday'
        WED = 'WED', 'Wednesday'
        THU = 'THU', 'Thursday'
        FRI = 'FRI', 'Friday'
        SAT = 'SAT', 'Saturday'
        SUN = 'SUN', 'Sunday'

    class EntryType(models.TextChoices):
        LECTURE = 'LECTURE', 'Lecture'
        LAB = 'LAB', 'Lab'

    class LoadClassification(models.TextChoices):
        REGULAR = 'REGULAR', 'Regular'
        OVERLOAD = 'OVERLOAD', 'Overload'
        BUILT_IN = 'BUILT_IN', 'Built-In'
        PART_TIME = 'PART_TIME', 'Part-Time'

    tenant = models.ForeignKey('core.Tenant', on_delete=models.CASCADE, related_name='schedule_entries')
    academic_period = models.ForeignKey(AcademicPeriod, on_delete=models.CASCADE, related_name='schedule_entries')
    course = models.ForeignKey(Course, on_delete=models.CASCADE, related_name='schedule_entries')
    faculty = models.ForeignKey(Faculty, on_delete=models.SET_NULL, null=True, blank=True, related_name='schedule_entries')
    room = models.ForeignKey(Room, on_delete=models.CASCADE, related_name='schedule_entries')
    sections = models.ManyToManyField(Section, related_name='schedule_entries', blank=True)
    day_of_week = models.CharField(max_length=3, choices=DayOfWeek.choices)
    time_start = models.TimeField()
    time_end = models.TimeField()
    group_id = models.UUIDField(default=uuid.uuid4)
    entry_type = models.CharField(max_length=10, choices=EntryType.choices, default=EntryType.LECTURE)
    load_classification = models.CharField(max_length=20, choices=LoadClassification.choices, default=LoadClassification.REGULAR)
    class_size = models.PositiveSmallIntegerField(default=0)
    faculty_credits = models.DecimalField(max_digits=5, decimal_places=2, default=0)
    remarks = models.TextField(blank=True, default='')
    linked_entry = models.ForeignKey('self', on_delete=models.SET_NULL, null=True, blank=True, related_name='linked_from')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'scheduling_entries'
        ordering = ['day_of_week', 'time_start']
        indexes = [
            models.Index(fields=['tenant', 'academic_period', 'day_of_week', 'time_start', 'time_end']),
            models.Index(fields=['tenant', 'academic_period', 'faculty']),
            models.Index(fields=['tenant', 'academic_period', 'room']),
            models.Index(fields=['group_id']),
        ]

    def __str__(self):
        return f'{self.course.code} {self.day_of_week} {self.time_start}-{self.time_end}'


class ScheduleConfig(models.Model):
    tenant = models.ForeignKey('core.Tenant', on_delete=models.CASCADE, related_name='schedule_configs')
    academic_period = models.OneToOneField(AcademicPeriod, on_delete=models.CASCADE, related_name='config')
    earliest_start_time = models.TimeField(default='07:00')
    latest_end_time = models.TimeField(default='21:00')
    time_slot_granularity_minutes = models.PositiveSmallIntegerField(default=30)
    operating_days = models.JSONField(default=list)
    break_periods = models.JSONField(default=list, blank=True)
    weight_faculty_priority = models.PositiveSmallIntegerField(default=50)
    weight_room_proximity = models.PositiveSmallIntegerField(default=50)
    weight_time_gap_minimization = models.PositiveSmallIntegerField(default=30)
    weight_load_distribution = models.PositiveSmallIntegerField(default=30)

    class Meta:
        db_table = 'scheduling_config'

    def __str__(self):
        return f'Config for {self.academic_period}'
