"""Merge duplicate Course and Faculty records created by name/code variants
across imports. Keeper chosen as the fullest/cleanest existing name.
Repoints ScheduleEntry + FacultyAvailability, deletes the duplicates,
then re-runs the cross-section slot merge and reports final conflicts."""
from collections import Counter

from apps.scheduling.cleaned_importer import merge_duplicate_slots, _name_tokens
from apps.scheduling.conflicts import analyze_period
from apps.scheduling.models import (
    AcademicPeriod, Course, Faculty, FacultyAvailability, ScheduleEntry,
)
from apps.core.models import Tenant

tenant = Tenant.objects.get()
period = AcademicPeriod.objects.get(pk=1)

# ---- courses: keeper_id <- [dupe_ids] --------------------------------
COURSE_MERGES = {
    488: [525],   # ALLIED 1
    584: [574],   # CBMEC 301
    547: [511],   # PATH FIT 1
    534: [620],   # PE 1
    639: [635],   # PROD ED 107
    640: [636],   # PROF ED 109
    481: [506],   # PROF ED 100
    491: [516],   # PROF ED 103
}

# ---- faculty: keeper_id <- [dupe_ids] --------------------------------
FACULTY_MERGES = {
    593: [595],                          # Dr. Hammiel O. Agustin
    519: [578, 579, 630],                # MIEL E. ALBACITE (incl 'Mile' typo)
    551: [582, 625, 646],                # Angel Nicole Luste, LPT
    557: [527, 570],                     # Jelika Cybelle Blanco
    505: [534, 626],                     # JEPPERSON BODONGAN
    559: [514, 590, 643],                # Jun Carlo Felipe, LPT
    580: [493, 501, 530, 562, 623, 641], # Caryl James Q. Eyas,LPT
    542: [536, 642],                     # ELEUTERIA CASIA  (E.)
    638: [538],                          # CASIA, N  (separate person)
    587: [486, 489, 509, 520, 540, 548], # Edwin T. Castro, LPT
    591: [574],                          # Christian Llyod Dumapias, CFMS
    510: [508, 543],                     # DARWIN B. CLARITO
    585: [555],                          # Atty. May Codilla
    545: [490, 499],                     # STEPHEN CORISIS (CORESIS, S variants)
    503: [484, 491, 532, 621],           # DANIEL C. TORALBA
    568: [546],                          # Edmund L. Sanchez, MM, CHRD,CHRA
    598: [524, 577],                     # Dr. Eugene P. Iglesias, PCPE
    600: [560, 576, 596, 599],           # Katrina Faith Panimdim,MBA,CHRA
    558: [507, 521, 526, 583, 640],      # Leopher O. Gigayon, LPT (incl 'Leo')
    549: [485, 492, 533, 563, 581],      # Myca S. Macabodbod, LPT
    513: [644],                          # LETECIA MACASO
    504: [539],                          # CHRISTINE MAE A. MANAGBANAG
    556: [550, 565, 569, 586],           # Mary Rose A. Murillo, LPT
    522: [552, 571],                     # MARYJOY C. POLISTICO
    588: [573, 645],                     # Ryan V. Pilapil, COMS, CBE
    554: [567],                          # Relian Pingcas, LPT, MAED
    575: [525],                          # Rachel Joyce Somblingo
    502: [553, 639],                     # JURIEN-NA P. SANCHEZ (incl 'SANCHEZ, J')
    506: [535],                          # DEBBIE G. TERUEL
    622: [500],                          # VALENZUELA, ROSE ANNE
    584: [566],                          # Shilly Mae Mendoza
}

# 0-entry bare surnames too ambiguous to merge — just delete
DELETE_FACULTY = [531, 529]              # 'SANCHEZ', 'VALENZUELA'

# pairs allowed to merge without a shared token (source-sheet misspellings)
ALLOW_NO_TOKEN = {(545, 490), (545, 499)}   # STEPHEN CORISIS <- CORESIS, S

moved_c = 0
for keep_id, dupes in COURSE_MERGES.items():
    keeper = Course.objects.get(pk=keep_id)
    for d in dupes:
        dupe = Course.objects.filter(pk=d).first()
        if dupe is None:
            continue  # already merged in a previous run
        n = ScheduleEntry.objects.filter(course=dupe).update(course=keeper)
        moved_c += n
        print(f'course {dupe.code!r} -> {keeper.code!r} ({n} entries)')
        dupe.delete()

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

for d in DELETE_FACULTY:
    f = Faculty.objects.filter(pk=d).first()
    if f is None:
        continue
    assert not ScheduleEntry.objects.filter(faculty=f).exists()
    print(f'deleting ambiguous 0-entry faculty {f.name!r}')
    f.delete()

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
