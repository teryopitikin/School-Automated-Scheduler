"""Merge duplicate Course and Faculty records re-created by the
'Consolidated (3) - BSED UPDATED' import (2026-08-07). The importer matches
by exact string, so the source sheet's name/code variants re-created records
that the 2026-07-30 merge had already canonicalized.

Keeper decisions mirror scripts/merge_duplicates_2026_07_30.py (same variant
strings, same people). New this round: bare 'SANCHEZ' -> Jurien-na (GE 105,
BEED 1-1, Room 15 = her block) and bare 'VALENZUELA' -> Rose Anne (GE 107;
Dennis teaches only IT labs). Repoints ScheduleEntry + FacultyAvailability,
deletes the duplicates, re-runs the cross-section slot merge and reports
final conflicts.
"""
from collections import Counter

from apps.scheduling.cleaned_importer import (
    merge_duplicate_slots, _name_tokens, _course_key,
)
from apps.scheduling.conflicts import analyze_period
from apps.scheduling.models import (
    AcademicPeriod, Course, Faculty, FacultyAvailability, ScheduleEntry,
)
from apps.core.models import Tenant

tenant = Tenant.objects.get()
period = AcademicPeriod.objects.get(pk=1)

# ---- courses: dupes created by this import (pk >= 651) merge into the
# pre-existing record with the same normalized code key ------------------
NEW_COURSE_PKS = [651, 652, 653, 654, 655, 656, 657, 658]

moved_c = 0
for pk in NEW_COURSE_PKS:
    dupe = Course.objects.filter(pk=pk).first()
    if dupe is None:
        continue  # already merged in a previous run
    matches = [c for c in Course.objects.filter(tenant=tenant).exclude(pk=pk)
               if _course_key(c.code) == _course_key(dupe.code)]
    assert len(matches) == 1, f'{dupe.code!r}: expected 1 keeper, got {matches}'
    keeper = matches[0]
    n = ScheduleEntry.objects.filter(course=dupe).update(course=keeper)
    moved_c += n
    print(f'course {dupe.code!r} -> {keeper.code!r} ({n} entries)')
    dupe.delete()

# ---- faculty: keeper_id <- [dupe_ids] ----------------------------------
FACULTY_MERGES = {
    519: [725, 710, 711],                # MIEL E. ALBACITE (incl 'Mile' typo)
    551: [713, 723, 715],                # Angel Nicole Luste, LPT
    585: [697],                          # Atty. May Codilla
    494: [660],                          # BALDONADO, H.
    495: [661],                          # PEROCHO, R.
    496: [662],                          # MAYBANTING, S.
    497: [663],                          # CORPUZ, J.
    672: [664, 498],                     # JHAN PAUL E. LIBRADILLA (fullest wins)
    505: [653, 684, 724],                # JEPPERSON BODONGAN
    504: [688],                          # CHRISTINE MAE A. MANAGBANAG
    542: [654, 686],                     # ELEUTERIA CASIA (E. / CASIA, E)
    638: [687],                          # CASIA, N  (separate person from Eleuteria)
    587: [689, 658, 673, 670, 693],      # Edwin T. Castro, LPT
    545: [659],                          # STEPHEN CORISIS (CORESIS, S misspelling)
    510: [669, 691],                     # DARWIN B. CLARITO
    591: [707],                          # Christian Llyod Dumapias, CFMS
    598: [709, 675],                     # Dr. Eugene P. Iglesias, PCPE
    593: [718],                          # Dr. Hammiel O. Agustin
    580: [667, 699, 680, 722, 652],      # Caryl James Q. Eyas,LPT (incl 'EYAS, CJ')
    559: [656, 690, 717],                # Jun Carlo Felipe, LPT
    558: [677, 651, 674, 668, 714],      # Leopher O. Gigayon, LPT (incl 'Leo')
    547: [665],                          # Proilan Jamaquilan, RPm (JAMAQUILAN, P)
    557: [678, 704],                     # Jelika Cybelle Blanco
    502: [650, 696, 681],                # JURIEN-NA P. SANCHEZ (incl bare 'SANCHEZ')
    568: [692],                          # Edmund L. Sanchez, MM, CHRD,CHRA
    600: [698, 720, 719, 708],           # Katrina Faith Panimdim,MBA,CHRA
    594: [671],                          # Kenny Paul Obeja, LPT
    513: [657],                          # LETECIA MACASO (MACASO, L)
    549: [655, 683, 700, 712],           # Myca S. Macabodbod, LPT
    556: [703, 694, 701, 716],           # Mary Rose A. Murillo, LPT
    522: [705, 695],                     # MARYJOY C. POLISTICO
    588: [706],                          # Ryan V. Pilapil, COMS, CBE
    575: [676],                          # Rachel Joyce Somblingo
    584: [702],                          # Shilly Mae Mendoza
    506: [685],                          # DEBBIE G. TERUEL
    503: [649, 682, 721],                # DANIEL C. TORALBA
    622: [666, 679],                     # VALENZUELA, ROSE ANNE (incl bare)
}

# pairs allowed to merge without a shared token (source-sheet misspellings)
ALLOW_NO_TOKEN = {(545, 659)}            # STEPHEN CORISIS <- CORESIS, S

moved_f = 0
for keep_id, dupes in FACULTY_MERGES.items():
    keeper = Faculty.objects.get(pk=keep_id)
    for d in dupes:
        dupe = Faculty.objects.filter(pk=d).first()
        if dupe is None:
            continue  # already merged in a previous run
        assert (_name_tokens(keeper.name) & _name_tokens(dupe.name)
                or not _name_tokens(dupe.name)
                or (keep_id, d) in ALLOW_NO_TOKEN), \
            f'no shared token: {keeper.name!r} vs {dupe.name!r}'
        n = ScheduleEntry.objects.filter(faculty=dupe).update(faculty=keeper)
        FacultyAvailability.objects.filter(faculty=dupe).update(faculty=keeper)
        moved_f += n
        print(f'faculty {dupe.name!r} -> {keeper.name!r} ({n} entries)')
        dupe.delete()

merged = merge_duplicate_slots(tenant, period)
print(f'\nslot re-merge collapsed: {merged} groups')
print('entries moved: courses', moved_c, '/ faculty', moved_f)
print('Course rows now  :', Course.objects.count())
print('Faculty rows now :', Faculty.objects.count())
print('entries now      :', ScheduleEntry.objects.filter(tenant=tenant, academic_period=period).count())

res = analyze_period(tenant, period)
types = Counter()
n_hard = 0
for eid, d in res.items():
    if d['hard']:
        n_hard += 1
        for c in d['hard']:
            types[c['type']] += 1
print('entries with hard clash:', n_hard)
for t, n in types.most_common():
    print(f'  {t:<8} ~{n // 2} pairs')
