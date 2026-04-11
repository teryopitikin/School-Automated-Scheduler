from django.http import JsonResponse

from .models import Tenant

PUBLIC_PREFIXES = ('/admin/', '/static/', '/api/loader/auth/')


class TenantMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        request.tenant = None

        # Skip tenant check for public routes
        if any(request.path.startswith(p) for p in PUBLIC_PREFIXES):
            return self.get_response(request)

        # Try subdomain detection
        host = request.get_host().split(':')[0]
        parts = host.split('.')
        if len(parts) > 2:
            slug = parts[0]
            try:
                request.tenant = Tenant.objects.get(slug=slug)
            except Tenant.DoesNotExist:
                pass

        # Fall back to authenticated user's tenant
        if request.tenant is None and hasattr(request, 'user') and request.user.is_authenticated:
            request.tenant = getattr(request.user, 'tenant', None)

        # Check tenant status
        if request.tenant and request.tenant.status == 'SUSPENDED':
            return JsonResponse(
                {'detail': 'This account has been suspended.'},
                status=403,
            )

        return self.get_response(request)
