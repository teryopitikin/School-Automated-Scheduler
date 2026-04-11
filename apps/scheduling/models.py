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
