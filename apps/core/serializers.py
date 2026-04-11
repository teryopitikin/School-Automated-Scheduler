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
        fields = ['id', 'username', 'email', 'role', 'tenant_id', 'tenant_name', 'is_active']
        read_only_fields = fields
