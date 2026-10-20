from .tenancy import get_active_clinic, user_clinics


def clinic(request):
    user = request.user
    if not user.is_authenticated:
        return {}
    active = get_active_clinic(request)
    name = user.get_full_name() or user.username
    initials = ''.join(w[0] for w in name.split() if w)[:2].upper() or 'DF'
    clinics = list(user_clinics(user))
    return {
        'clinic': active,
        'clinics': clinics,
        'user_display_name': name,
        'user_initials': initials,
        'profile_json': {'name': name, 'email': user.email, 'clinic': active.name, 'clinicId': active.id},
    }
