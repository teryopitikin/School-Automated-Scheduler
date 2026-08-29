from django.contrib.auth import login, logout
from django.middleware.csrf import get_token
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response

from .serializers import LoginSerializer, UserSerializer


@api_view(['POST'])
@permission_classes([AllowAny])
def login_view(request):
    serializer = LoginSerializer(data=request.data, context={'request': request})
    serializer.is_valid(raise_exception=True)
    user = serializer.validated_data['user']
    login(request, user)
    return Response(UserSerializer(user).data)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def logout_view(request):
    logout(request)
    return Response({'detail': 'Logged out.'})


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def current_user_view(request):
    return Response(UserSerializer(request.user).data)


@api_view(['GET'])
@permission_classes([AllowAny])
def csrf_view(request):
    return Response({'csrfToken': get_token(request)})


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def change_password_view(request):
    """Any logged-in user changes their OWN password; the current one must
    be proven first. The session survives the change."""
    from django.contrib.auth import update_session_auth_hash

    current = request.data.get('current_password') or ''
    new = request.data.get('new_password') or ''
    if not request.user.check_password(current):
        return Response({'detail': 'Current password is incorrect.'},
                        status=status.HTTP_400_BAD_REQUEST)
    if len(new) < 6:
        return Response({'detail': 'New password must be at least 6 characters.'},
                        status=status.HTTP_400_BAD_REQUEST)
    request.user.set_password(new)
    request.user.save(update_fields=['password'])
    update_session_auth_hash(request, request.user)
    return Response({'detail': 'Password changed.'})


from rest_framework import viewsets

from .models import User
from .permissions import IsAdminRole
from .serializers import ManageUserSerializer


class UserViewSet(viewsets.ModelViewSet):
    """Admin-only user management. No hard delete — deactivate via
    is_active=false instead."""
    serializer_class = ManageUserSerializer
    permission_classes = [IsAuthenticated, IsAdminRole]
    http_method_names = ['get', 'post', 'put', 'patch', 'head', 'options']

    def get_queryset(self):
        return User.objects.filter(tenant=self.request.user.tenant).order_by('username')

    def perform_create(self, serializer):
        serializer.save(tenant=self.request.user.tenant)
