"""Merge duplicate Course and Faculty records re-created by the
'Consolidated (1)' import (2026-08-18). The importer matches by exact
string, so the source sheet's name/code variants re-created records that
the 2026-07-30 / 2026-08-07 merges had already canonicalized.

Keeper decisions mirror the two previous merge scripts (same people, same
reasoning): bare 'SANCHEZ' and 'SANCHEZ, J' -> Jurien-na (Edmund's initial
is E), bare 'VALENZUELA' -> Rose Anne (Dennis teaches only IT labs),
'CASIA, E'/'E. CASIA' -> Eleuteria while 'N. CASIA' -> the separate
'CASIA, N', 'C. MANAGBANAG' -> Christine Mae (not Allan). Also folds the
long-standing 'PROD ED 107' typo course into 'Prof Ed 107'. Repoints
ScheduleEntry + FacultyAvailability, deletes the duplicates, re-runs the
cross-section slot merge and reports final conflicts.

Run via: manage.py shell < scripts/merge_duplicates_2026_08_18.py
"""
from collections import Counter

from apps.scheduling.cleaned_importer import merge_duplicate_slots
from apps.scheduling.conflicts import analyze_period
from apps.scheduling.models import (
    AcademicPeriod, Course, Faculty, FacultyAvailability, ScheduleEntry,
)
from apps.core.models import Tenant

tenant = Tenant.objects.get()
period = AcademicPeriod.objects.get(pk=1)

# ---- courses: keeper_pk <- [dupe_pks] ----------------------------------
COURSE_MERGES = {
    597: [666],        # LEA 2 <- '08:00 AM - 09:00 AM' (row-321 slip, 0 entries)
    488: [664],        # ALLIED 1 <- 'Allied 1'
    584: [665],        # CBMEC 301 <- 'CBMEC  301'
    547: [662],        # PATH FIT 1 <- 'PATHFIT 1'
    534: [667],        # PE 1 <- 'PE1'
    558: [659, 639],   # Prof Ed 107 <- 'PROD ED / 107' + old 'PROD ED 107' typo
    640: [660],        # PROF ED 109 <- 'PROF ED / 109'
    481: [661],        # PROF ED 100 <- 'Prof Ed 100' (0 entries)
    491: [663],        # PROF ED 103 <- 'Prof Ed 103'
}

moved_c = 0
for keeper_pk, dupe_pks in COURSE_MERGES.items():
    keeper = Course.objects.get(pk=keeper_pk)
    for pk in dupe_pks:
        dupe = Course.objects.filter(pk=pk).first()
        if dupe is None:
            continue  # already merged in a previous run
        n = ScheduleEntry.objects.filter(course=dupe).update(course=keeper)
        moved_c += n
        print(f'course {dupe.code!r} -> {keeper.code!r} ({n} entries)')
        dupe.delete()

# ---- faculty: keeper_pk <- [dupe_pks] ----------------------------------
FACULTY_MERGES = {
    519: [799, 785, 786],                 # MIEL E. ALBACITE (incl 'Mile' typo)
    551: [788, 797],                      # Angel Nicole Luste, LPT
    585: [772],                           # Atty. May Codilla
    505: [759, 798],                      # JEPPERSON BODONGAN
    504: [763],                           # CHRISTINE MAE A. MANAGBANAG
    580: [743, 774, 796, 729, 739, 755],  # Caryl James Q. Eyas, LPT
    542: [731, 761],                      # ELEUTERIA CASIA (E. / CASIA, E)
    638: [762],                           # CASIA, N (separate person)
    587: [764, 735, 734, 748, 746, 768],  # Edwin T. Castro, LPT
    545: [736, 741],                      # STEPHEN CORISIS (CORESIS misspelling)
    591: [782],                           # Christian Llyod Dumapias, CFMS
    510: [745, 766],                      # DARWIN B. CLARITO
    598: [784, 750],                      # Dr. Eugene P. Iglesias, PCPE
    593: [792],                           # Dr. Hammiel O. Agustin
    568: [767],                           # Edmund L. Sanchez, MM, CHRD,CHRA
    559: [732, 765, 791],                 # Jun Carlo Felipe, LPT
    558: [752, 728, 749, 744, 789],       # Leopher O. Gigayon, LPT
    557: [753, 779],                      # Jelika Cybelle Blanco
    502: [771, 756, 727],                 # JURIEN-NA P. SANCHEZ (bare + J.)
    594: [747],                           # Kenny Paul Obeja, LPT
    600: [773, 794, 793, 783],            # Katrina Faith Panimdim, MBA, CHRA
    672: [740],                           # JHAN PAUL E. LIBRADILLA
    549: [758, 730, 738, 775, 787],       # Myca S. Macabodbod, LPT
    513: [733],                           # LETECIA MACASO
    556: [778, 769, 776, 790],            # Mary Rose A. Murillo, LPT
    522: [780, 770],                      # MARYJOY C. POLISTICO
    575: [751],                           # Rachel Joyce Somblingo
    622: [742, 754],                      # VALENZUELA, ROSE ANNE (bare incl.)
    588: [781],                           # Ryan V. Pilapil, COMS, CBE
    584: [777],                           # Shilly Mae Mendoza
    506: [760],                           # DEBBIE G. TERUEL
    503: [726, 757, 737, 795],            # DANIEL C. TORALBA
}

moved_f = 0
for keeper_pk, dupe_pks in FACULTY_MERGES.items():
    keeper = Faculty.objects.get(pk=keeper_pk)
    for pk in dupe_pks:
        dupe = Faculty.objects.filter(pk=pk).first()
        if dupe is None:
            continue  # already merged in a previous run
        n = ScheduleEntry.objects.filter(faculty=dupe).update(faculty=keeper)
        FacultyAvailability.objects.filter(faculty=dupe).update(faculty=keeper)
        moved_f += n
        print(f'faculty {dupe.name!r} -> {keeper.name!r} ({n} entries)')
        dupe.delete()

print(f'\nrepointed {moved_c} course entries, {moved_f} faculty entries')
print('courses now:', Course.objects.count(), '| faculty now:', Faculty.objects.count())

# ---- re-run the cross-section co-taught slot merge ---------------------
merged = merge_duplicate_slots(tenant, period)
print('slot merge collapsed:', merged)
print('entries now:', ScheduleEntry.objects.filter(
    tenant=tenant, academic_period=period).count())

# ---- final conflict report ---------------------------------------------
result = analyze_period(tenant, period)
pairs = set()
for entry_id, r in result.items():
    for h in r['hard']:
        pairs.add((h['type'],) + tuple(sorted((entry_id, h['conflicting_entry_id']))))
counts = Counter(p[0] for p in pairs)
print('\nhard-conflict clash pairs:', dict(counts), 'total', len(pairs))
n_warn = sum(len(r['warnings']) for r in result.values())
print('warnings (overload/capacity):', n_warn)
