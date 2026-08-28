from django.contrib.auth import authenticate
from rest_framework import serializers

from .models import User


class LoginSerializer(serializers.Serializer):
    username = serializers.CharField()
    password = serializers.CharField(write_only=True)

    def validate(self, attrs):
        user = authenticate(
            request=self.context.get('request'),
            username=attrs['username'],
            password=attrs['password'],
        )
        if not user:
            raise serializers.ValidationError('Invalid credentials.')
        if not user.is_active:
            raise serializers.ValidationError('Account is disabled.')
        attrs['user'] = user
        return attrs


class UserSerializer(serializers.ModelSerializer):
    tenant_id = serializers.IntegerField(source='tenant.pk', read_only=True, default=None)
    tenant_name = serializers.CharField(source='tenant.name', read_only=True, default='')

    class Meta:
        model = User
        fields = ['id', 'username', 'email', 'role', 'managed_program_codes',
                  'managed_department_codes', 'managed_course_codes',
                  'tenant_id', 'tenant_name', 'is_active']
        read_only_fields = fields


class ManageUserSerializer(serializers.ModelSerializer):
    """Admin user management. Password is write-only: required on create,
    optional on update (omit to keep the current one)."""
    password = serializers.CharField(write_only=True, required=False,
                                     allow_blank=False, min_length=6)

    class Meta:
        model = User
        fields = ['id', 'username', 'email', 'password', 'role',
                  'managed_program_codes', 'managed_department_codes',
                  'managed_course_codes', 'is_active']

    def _validate_codes(self, value):
        if not isinstance(value, list) or any(not isinstance(c, str) for c in value):
            raise serializers.ValidationError('Expected a list of codes.')
        return value

    validate_managed_program_codes = _validate_codes
    validate_managed_department_codes = _validate_codes
    validate_managed_course_codes = _validate_codes

    def validate(self, attrs):
        if self.instance is None and not attrs.get('password'):
            raise serializers.ValidationError({'password': 'Password is required.'})
        return attrs

    def create(self, validated_data):
        password = validated_data.pop('password')
        user = User(**validated_data)
        user.set_password(password)
        user.save()
        return user

    def update(self, instance, validated_data):
        password = validated_data.pop('password', None)
        for k, v in validated_data.items():
            setattr(instance, k, v)
        if password:
            instance.set_password(password)
        instance.save()
        return instance
