class TenantQuerySetMixin:
    """Filters queryset by the authenticated user's tenant and auto-sets tenant on create."""

    def get_queryset(self):
        qs = super().get_queryset()
        tenant = getattr(self.request, 'tenant', None)
        if tenant:
            return qs.filter(tenant=tenant)
        if hasattr(self.request.user, 'tenant') and self.request.user.tenant:
            return qs.filter(tenant=self.request.user.tenant)
        return qs.none()

    def perform_create(self, serializer):
        tenant = getattr(self.request, 'tenant', None) or self.request.user.tenant
        serializer.save(tenant=tenant)
