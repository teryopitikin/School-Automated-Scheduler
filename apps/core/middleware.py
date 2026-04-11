class TenantMiddleware:
    """Pass-through tenant middleware stub. Will be implemented in Task 3."""

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        return self.get_response(request)
