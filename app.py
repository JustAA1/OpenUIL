# app.py

from flask import Flask, jsonify, request, send_from_directory
import csv
import os
import threading
from collections import defaultdict
from datetime import datetime
import re

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
app = Flask(__name__, static_folder=BASE_DIR, template_folder=BASE_DIR)

CSV_DIR = os.path.join(BASE_DIR, 'uilData')

SCORE_FIELDS = ['Total', 'Total Score', 'Score', 'Scores Totaled', 'Science Total', 'Written', 'Written Score', 'Objective Score', 'Objective', 'Points']

CLASSIFICATION_YEAR_START = 2004


def get_score(row):
    for field in SCORE_FIELDS:
        val = row.get(field, '')
        if val:
            try:
                return float(val)
            except (ValueError, TypeError):
                continue
    return 0


def normalize_row(row):
    for field in SCORE_FIELDS:
        val = row.get(field, '')
        if val:
            row['Score'] = val
            return
    row['Score'] = ''


def ordinal(n):
    if 10 <= n % 100 <= 20:
        suffix = 'th'
    else:
        suffix = {1: 'st', 2: 'nd', 3: 'rd'}.get(n % 10, 'th')
    return f"{n}{suffix}"


SCHOOL_NAME_NORMALIZATIONS = {
    'College Station A & M Cons': 'College Station A&M Consolidated',
    'A & M Cons HS, College Station': 'College Station A&M Consolidated',
    'Rosenberg Lamar Cons': 'Rosenberg Lamar Consolidated',
    'Sadler S & S Consolidated': 'Sadler S&S Consolidated',
    'Sadler S & S Cons.': 'Sadler S&S Consolidated',
    'Cannutillo NW Early College': 'Cannutillo Northwest Early College',
    'Spring Conroe Grand Oaks': 'Conroe Grand Oaks',
    'Spring Klein Collins': 'Klein Collins',
    'Spring Klein Oak': 'Klein Oak',
    'Spring Dekaney': 'Spring DeKaney',
    'Houston Macarthur': 'Houston MacArthur',
    'San Antonio Lee': 'San Antonio LEE',
    'Austin Idea Bluff Springs': 'Austin IDEA Bluff Springs',
    'Dallas A+ Academy': 'Dallas A+',
    'Irving Singley Academy': 'Irving Singley',
    'Kyle Lehman High School': 'Kyle Lehman',
    'Monte Alto High School': 'Monte Alto',
    'Odessa UTPB Stem': 'Odessa UTPB STEM Academy',
    'El Paso Harmony Science Academy': 'El Paso Harmony Science Acad',
    'South San Antonio West Hs': 'South San Antonio West',
    'Waxahachie Global High School': 'Waxahachie Global',
    'Weslaco IDEA College Prep': 'Weslaco IDEA College',
    'Humble ': 'Humble',
    'Mount Enterprise ': 'Mount Enterprise',
    'Alief Early College': 'Houston Alief Early College',
    'Jersey Village': 'Houston Jersey Village',
    'Klein Forest': 'Houston Klein Forest',
    'Langham Creek': 'Houston Langham Creek',
    'Stratford': 'Houston Stratford',
    'North Crowley': 'Fort Worth North Crowley',
    'Northwest Eaton': 'Fort Worth Northwest Eaton',
    '"Darrouzett': 'Darrouzett',
    'Anderson-Schiro': 'Anderson-Shiro',
    'Liberty Hil': 'Liberty Hill',
    'Colleyville Heritage': 'Colleyville-Heritage',
    'De Soto': 'DeSoto',
    'La Joya Juarez Lincoln': 'La Joya Juarez-Lincoln',
    'Martins Mill': "Martin's Mill",
    'Rockwall Heath': 'Rockwall-Heath',
    'SA Young Womens Leadership': "SA Young Women's Leadership",
    'Ft. Worth South Hills': 'Ft Worth South Hills',
    'Mt Belvieu Barbers Hill': 'Mont Belvieu Barbers Hill',
    'Ft Worth Boswell': 'Fort Worth Boswell',
    'Ft Worth Carter-Riverside': 'Fort Worth Carter-Riverside',
    'Ft Worth Dunbar': 'Fort Worth Dunbar',
    'Ft Worth Eastern Hills': 'Fort Worth Eastern Hills',
    'Ft Worth North Side': 'Fort Worth North Side',
    'Ft Worth Paschal': 'Fort Worth Paschal',
    'Ft Worth Polytechnic': 'Fort Worth Polytechnic',
    'Ft Worth Southwest': 'Fort Worth Southwest',
    'Ft Worth Western Hills': 'Fort Worth Western Hills',
    'Ft Worth South Hills': 'Fort Worth South Hills',
}

def normalize_school_name(school):
    return SCHOOL_NAME_NORMALIZATIONS.get(school, school)


PERSON_NAME_FIXES = {
    'Zachany Kallus': 'Zachary Kallus',
    'Zhuoyl Wu': 'Zhuoyi Wu',
    'Zhihoa Zhu': 'Zhihao Zhu',
    'Zacc House': 'Zach House',
    'Zoe Anna Shelepet': 'Zoe-Anna Shelepet',
    'Kedar Vernerkar': 'Kedar Vernekar',
    'andrew xiao': 'Andrew Xiao',
}

LOWERCASE_WORDS = {'de', 'la', 'le', 'van', 'von', 'del', 'da', 'das', 'dos', 'el', 'al', 'bin', 'ibn', 'di', 'du', 'der', 'lo', 'ten'}

def normalize_person_name(name):
    if not name:
        return name
    
    if name in PERSON_NAME_FIXES:
        return PERSON_NAME_FIXES[name]
    
    name = re.sub(r'^\d+\.\s*', '', name)
    
    parts = name.split()
    normalized_parts = []
    
    INITIAL_SUFFIXES = {'j', 'c', 'd', 't', 'p', 'r'}
    
    for i, part in enumerate(parts):
        if i > 0 and part.lower() in LOWERCASE_WORDS:
            normalized_parts.append(part.lower())
            continue
        
        if len(part) > 2 and part[0:2].lower() == 'mc':
            normalized_parts.append('Mc' + part[2:].capitalize())
        elif "'" in part:
            sub_parts = part.split("'")
            normalized_parts.append("'".join(p.capitalize() for p in sub_parts))
        elif '-' in part:
            sub_parts = part.split('-')
            normalized_parts.append('-'.join(p.capitalize() if p.lower() not in LOWERCASE_WORDS else p.lower() for p in sub_parts))
        elif '.' in part:
             normalized_parts.append(part.upper())
        elif len(part) == 2 and part[1].lower() in INITIAL_SUFFIXES and part.lower() not in {'ad', 'at', 'it', 'up', 'do', 'go', 'to', 'ed', 'jo', 'ty', 'cy', 'bo', 'al'}:
            normalized_parts.append(f"{part[0].upper()}.{part[1].upper()}.")
        else:
            if part and part[0].islower():
                normalized_parts.append(part.capitalize())
            else:
                normalized_parts.append(part)
    
    return ' '.join(normalized_parts)



COMP_NAMES = {
    'Accounting': 'Accounting',
    'CalcApps': 'Calculator Applications',
    'CompApps': 'Computer Applications',
    'CompSci': 'Computer Science',
    'CopyEditing': 'Copy Editing',
    'CurrentIssues&Events': 'Current Issues & Events',
    'Editorial': 'Editorial Writing',
    'FeatureWriting': 'Feature Writing',
    'HeadlineWriting': 'Headline Writing',
    'InformativeSpeaking': 'Informative Speaking',
    'LincolnDouglasDebate': 'Lincoln-Douglas Debate',
    'LitCrit': 'Literary Criticism',
    'Math': 'Mathematics',
    'NewsWriting': 'News Writing',
    'NumberSense': 'Number Sense',
    'PersuasiveSpeaking': 'Persuasive Speaking',
    'PoetryInterpretation': 'Poetry Interpretation',
    'ProseInterpretation': 'Prose Interpretation',
    'ReadyWriting': 'Ready Writing',
    'Science': 'Science',
    'SocialStudies': 'Social Studies',
    'Spelling': 'Spelling'
}

SEARCH_INDEX = []
RESULTS_INDEX = defaultdict(list)
TEAM_INDEX = defaultdict(list)
CLASSIFICATION_INDEX = defaultdict(dict)
SCIENCE_INDEX = defaultdict(list)
# Full row lists for /api/search (same loads as index build — avoids a second read/cache).
INDIV_ROWS_BY_CONF: dict[str, list[dict]] = {}
TEAM_ROWS_BY_CONF: dict[str, list[dict]] = {}
INDEX_BUILT = False

INIT_TOTAL_STEPS = 13
INIT_PERCENT = 0
_INIT_PROGRESS_LOCK = threading.Lock()
_INIT_BUILD_LOCK = threading.Lock()


def _set_init_progress_step(step: int) -> None:
    global INIT_PERCENT
    with _INIT_PROGRESS_LOCK:
        INIT_PERCENT = min(100, int(round(100 * step / INIT_TOTAL_STEPS)))


def classification_catalog_years() -> list[int]:
    """Years used when reporting classification gaps: 2004 through the current calendar year only (no future years)."""
    end = datetime.now().year
    return list(range(CLASSIFICATION_YEAR_START, end + 1))


def init_global_data():
    global SEARCH_INDEX, RESULTS_INDEX, TEAM_INDEX, CLASSIFICATION_INDEX, SCIENCE_INDEX
    global INDIV_ROWS_BY_CONF, TEAM_ROWS_BY_CONF, INDEX_BUILT
    if INDEX_BUILT:
        return

    with _INIT_BUILD_LOCK:
        if INDEX_BUILT:
            return

        seen_combos = set()
        temp_search = []
        conferences = ['1A', '2A', '3A', '4A', '5A', '6A']
        team_rows_by_conf = {c: [] for c in conferences}
        indiv_rows_by_conf = {c: [] for c in conferences}
        team_index = defaultdict(list)
        classification_index = defaultdict(dict)
        results_index = defaultdict(list)
        science_index = defaultdict(list)

        step = 0
        _set_init_progress_step(step)

        print("Loading rankings (per conference: individual, then team)...")
        for conf in conferences:
            indiv_path = os.path.join(CSV_DIR, f'{conf}-IndivRankings.csv')
            if os.path.exists(indiv_path):
                try:
                    with open(indiv_path, 'r', encoding='utf-8') as f:
                        reader = csv.DictReader(f)
                        for row in reader:
                            indiv_rows_by_conf[conf].append(row)
                            name_raw = row.get('Entry', '') or row.get('Team Members', '')
                            if not name_raw:
                                continue

                            name = normalize_person_name(name_raw)
                            school_raw = row.get('School Name', '') or row.get('School', '')
                            school = normalize_school_name(school_raw)
                            year = row.get('Year', '')
                            district = row.get('District', '')

                            if district and not row.get('Region') and not row.get('State') and school and year:
                                try:
                                    y_int = int(year)
                                    if y_int not in classification_index[school]:
                                        d_int = int(district)
                                        r_int = (d_int - 1) // 8 + 1
                                        classification_index[school][y_int] = {
                                            'year': y_int,
                                            'conference': conf,
                                            'district': district,
                                            'region': r_int
                                        }
                                except Exception:
                                    pass

                            combo_key = f"{name}|{school}"
                            if combo_key not in seen_combos:
                                seen_combos.add(combo_key)
                                temp_search.append({
                                    'name': name,
                                    'school': school,
                                    'search_text': f"{name.lower()} {school.lower()}"
                                })

                            event = row.get('EventName', '')

                            if row.get('State'):
                                level = 'State'
                                view_type = 'state'
                                district = None
                                region = None
                                level_val = None
                            elif row.get('Region'):
                                level = f"Region {row.get('Region')}"
                                view_type = 'region'
                                district = None
                                region = row.get('Region')
                                level_val = region
                            elif row.get('District'):
                                level = f"District {row.get('District')}"
                                view_type = 'district'
                                district = row.get('District')
                                region = None
                                level_val = district
                            else:
                                continue

                            score = None
                            for field in SCORE_FIELDS:
                                if row.get(field):
                                    score = row.get(field)
                                    break

                            result_entry = {
                                'name': name,
                                'name_raw': name_raw,
                                'school': school,
                                'conference': conf,
                                'year': year,
                                'eventCode': event,
                                'eventDisplay': COMP_NAMES.get(event, event),
                                'level': level,
                                'viewType': view_type,
                                'district': district,
                                'region': region,
                                'level_val': level_val,
                                'place': row.get('Place', '-'),
                                'score': score or '-',
                                'advance': row.get('Advance?', '')
                            }

                            if event == 'Science':
                                bio = row.get('Biology', '')
                                chem = row.get('Chemistry', '')
                                phys = row.get('Physics', '')
                                if bio or chem or phys:
                                    result_entry['biology'] = bio
                                    result_entry['chemistry'] = chem
                                    result_entry['physics'] = phys
                                    sci_key = (conf, year, view_type, level_val)
                                    science_index[sci_key].append({
                                        'name': name,
                                        'bio': int(bio) if bio else 0,
                                        'chem': int(chem) if chem else 0,
                                        'phys': int(phys) if phys else 0,
                                        'total': int(score) if score and score != '-' else 0
                                    })

                            results_index[name].append(result_entry)

                except Exception as e:
                    print(f"Error reading {indiv_path}: {e}")
            step += 1
            _set_init_progress_step(step)

            team_path = os.path.join(CSV_DIR, f'{conf}-TeamRankings.csv')
            if os.path.exists(team_path):
                try:
                    with open(team_path, 'r', encoding='utf-8') as f:
                        reader = csv.DictReader(f)
                        for row in reader:
                            team_rows_by_conf[conf].append(row)
                            key = (conf, row.get('Year', ''), row.get('EventName', ''))
                            team_index[key].append(row)
                except Exception as e:
                    print(f"Error reading {team_path}: {e}")
            step += 1
            _set_init_progress_step(step)

        temp_search.sort(key=lambda x: (x['name'].lower(), x['school'].lower()))

        SEARCH_INDEX = temp_search
        RESULTS_INDEX = results_index
        TEAM_INDEX = team_index
        CLASSIFICATION_INDEX = classification_index
        SCIENCE_INDEX = science_index
        INDIV_ROWS_BY_CONF = indiv_rows_by_conf
        TEAM_ROWS_BY_CONF = team_rows_by_conf
        step += 1
        _set_init_progress_step(step)
        INDEX_BUILT = True
        print(f"Indices built: {len(SEARCH_INDEX)} search entries, {len(RESULTS_INDEX)} people, {len(CLASSIFICATION_INDEX)} schools.")


def _start_index_load() -> None:
    thread = threading.Thread(target=init_global_data, daemon=True)
    thread.start()


_start_index_load()


def _index_not_ready_response():
    return jsonify({'error': 'Data is still loading', 'ready': False}), 503


def filter_results(data, year, competition, view_type, district=None, region=None):
    filtered = [row for row in data if row.get('Year') == year and row.get('EventName') == competition]
    
    if view_type == 'district':
        filtered = [row for row in filtered if row.get('District') == district and not row.get('Region') and not row.get('State')]
    elif view_type == 'region':
        filtered = [row for row in filtered if row.get('Region') == region and not row.get('State')]
    elif view_type == 'state':
        filtered = [row for row in filtered if row.get('State') == '1']
    elif view_type == 'region-districts':
        region_num = int(region) if region else 1
        start = (region_num - 1) * 8 + 1
        end = region_num * 8
        filtered = [row for row in filtered if row.get('District') and not row.get('Region') and not row.get('State')]
        filtered = [row for row in filtered if start <= int(row.get('District', 0) or 0) <= end]
    elif view_type == 'all-districts':
        filtered = [row for row in filtered if row.get('District') and not row.get('Region') and not row.get('State')]
    elif view_type == 'all-regions':
        filtered = [row for row in filtered if row.get('Region') and not row.get('State')]
    
    return filtered


def get_missing_districts(data, year, competition, view_type, region=None):
    if view_type == 'region-districts':
        region_num = int(region) if region else 1
        start = (region_num - 1) * 8 + 1
        end = region_num * 8
        districts_to_check = list(range(start, end + 1))
    elif view_type == 'all-districts':
        districts_to_check = list(range(1, 33))
    else:
        return []
    
    filtered = [row for row in data if row.get('Year') == year and row.get('EventName') == competition]
    filtered = [row for row in filtered if row.get('District') and not row.get('Region') and not row.get('State')]
    
    districts_with_data = set()
    for row in filtered:
        try:
            districts_with_data.add(int(row.get('District', 0)))
        except (ValueError, TypeError):
            pass
    
    return [d for d in districts_to_check if d not in districts_with_data]


def process_results(results, view_type):
    for row in results:
        normalize_row(row)
    
    results.sort(key=get_score, reverse=True)
    
    is_multi = view_type in ['region-districts', 'all-districts', 'all-regions']
    
    if is_multi:
        current_rank = 1
        prev_score = None
        for i, row in enumerate(results):
            place_val = row.get('Place', '')
            if place_val:
                if any(c.isalpha() for c in str(place_val)):
                    row['OriginalPlace'] = str(place_val)
                else:
                    try:
                        row['OriginalPlace'] = ordinal(int(place_val))
                    except (ValueError, TypeError):
                        row['OriginalPlace'] = str(place_val)
            else:
                row['OriginalPlace'] = ''
            
            current_score = get_score(row)
            if prev_score is not None and current_score == prev_score:
                row['RelativePlace'] = ordinal(current_rank)
            else:
                current_rank = i + 1
                row['RelativePlace'] = ordinal(current_rank)
            prev_score = current_score
    else:
        for row in results:
            row['RelativePlace'] = row.get('Place', '')
    
    return results


@app.route('/')
def index():
    return send_from_directory(BASE_DIR, 'index.html')


@app.route('/app.js')
def serve_js():
    return send_from_directory(BASE_DIR, 'app.js')


@app.route('/api/init-status', methods=['GET'])
def init_status():
    with _INIT_PROGRESS_LOCK:
        pct = INIT_PERCENT
    ready = INDEX_BUILT
    return jsonify({
        'ready': ready,
        'percent': 100 if ready else pct,
    })


@app.route('/api/search', methods=['GET'])
def search():
    if not INDEX_BUILT:
        return _index_not_ready_response()

    year = request.args.get('year')
    conference = request.args.get('conference')
    competition = request.args.get('competition')
    view_type = request.args.get('viewType')
    district = request.args.get('district')
    region = request.args.get('region')
    
    if not all([year, conference, competition, view_type]):
        return jsonify({'error': 'Missing required parameters'}), 400
    
    indiv_data = INDIV_ROWS_BY_CONF.get(conference, [])
    team_data = TEAM_ROWS_BY_CONF.get(conference, [])
    
    indiv_results = filter_results(indiv_data, year, competition, view_type, district, region)
    team_results = filter_results(team_data, year, competition, view_type, district, region)
    
    indiv_results = process_results(indiv_results, view_type)
    team_results = process_results(team_results, view_type)
    
    missing_districts = get_missing_districts(indiv_data, year, competition, view_type, region)
    
    return jsonify({
        'indiv': indiv_results,
        'team': team_results,
        'count': len(indiv_results) + len(team_results),
        'missingDistricts': missing_districts
    })


@app.route('/api/school-search', methods=['GET'])
def school_search():
    if not INDEX_BUILT:
        return _index_not_ready_response()

    query = request.args.get('query', '').strip().lower()
    
    if len(query) < 2:
        return jsonify({'results': []})
    
    matches = []
    count = 0
    for school in sorted(CLASSIFICATION_INDEX.keys(), key=str.lower):
        if query in school.lower():
            matches.append(school)
            count += 1
            if count >= 20: 
                break
            
    return jsonify({'results': matches})


@app.route('/api/classification', methods=['GET'])
@app.route('/api/alignment', methods=['GET'])
def classification():
    if not INDEX_BUILT:
        return _index_not_ready_response()

    year = request.args.get('year')
    school_query = request.args.get('school', '').strip().lower()
    
    if not year or not school_query:
        return jsonify({'error': 'Missing year or school parameter'}), 400
    
    try:
        year_int = int(year)
    except ValueError:
        return jsonify({'results': []})
        
    results = []
    
    for school_name, years_data in CLASSIFICATION_INDEX.items():
        if school_query in school_name.lower():
            if year_int in years_data:
                row = years_data[year_int]
                results.append({
                    'school': school_name,
                    'conference': row['conference'],
                    'district': row['district'],
                    'region': row['region']
                })
    
    results.sort(key=lambda x: x['school'].lower())
    
    return jsonify({'results': results, 'count': len(results)})


@app.route('/api/classification-all-years', methods=['GET'])
@app.route('/api/alignment-all-years', methods=['GET'])
def classification_all_years():
    if not INDEX_BUILT:
        return _index_not_ready_response()

    school_query = request.args.get('school', '').strip().lower()
    
    if not school_query:
        return jsonify({'error': 'Missing school parameter'}), 400
    
    all_years = classification_catalog_years()
    
    target_school = None
    for s in CLASSIFICATION_INDEX.keys():
        if s.lower() == school_query:
            target_school = s
            break
            
    by_year = {}
    if target_school:
        by_year = CLASSIFICATION_INDEX.get(target_school, {})
    
    if not by_year:
        return jsonify({
            'classifications': [],
            'alignments': [],
            'missingYears': '',
            'count': 0,
        })

    classifications = []
    for y in sorted(by_year.keys(), reverse=True):
        data = by_year[y]
        classifications.append({
            'year': y,
            'conference': data['conference'],
            'district': data['district'],
            'region': data['region']
        })

    years_with_data = set(by_year.keys())
    years_without_data = [y for y in all_years if y not in years_with_data]
    
    def format_year_ranges(years):
        if not years: return ""
        years = sorted(years)
        ranges = []
        if not years: return ""
        
        start = years[0]
        end = years[0]
        
        for y in years[1:]:
            if y == end + 1:
                end = y
            else:
                if start == end:
                    ranges.append(str(start))
                else:
                    ranges.append(f"{start}-{end}")
                start = y
                end = y
        
        if start == end:
            ranges.append(str(start))
        else:
            ranges.append(f"{start}-{end}")
        
        return ", ".join(ranges)

    missing_years_str = format_year_ranges(years_without_data)
    
    return jsonify({
        'classifications': classifications,
        'alignments': classifications,
        'missingYears': missing_years_str,
        'count': len(classifications),
    })


@app.route('/api/person-search', methods=['GET'])
def person_search():
    query = request.args.get('query', '').strip().lower()
    
    if len(query) < 2:
        return jsonify({'results': []})

    if not INDEX_BUILT:
        return _index_not_ready_response()
    
    results = []
    count = 0
    limit = 50
    
    for item in SEARCH_INDEX:
        if query in item['search_text']:
            results.append({
                'name': item['name'],
                'school': item['school']
            })
            count += 1
            if count >= limit:
                break
    
    return jsonify({'results': results})


@app.route('/api/person-results', methods=['GET'])
def person_results():
    if not INDEX_BUILT:
        return _index_not_ready_response()

    person_name = request.args.get('name', '').strip()
    person_school = request.args.get('school', '').strip()
    
    if not person_name:
        return jsonify({'error': 'Missing name parameter'}), 400
    
    results_by_year = {}
    
    raw_results = RESULTS_INDEX.get(person_name, [])
    
    for r in raw_results:
        if person_school and r['school'] != person_school:
            continue
            
        team_place = None
        team_key = (r['conference'], r['year'], r['eventCode'])
        team_rows = TEAM_INDEX.get(team_key, [])
        
        for t_row in team_rows:
            match = False
            
            if r['viewType'] == 'state' and t_row.get('State'):
                 match = True
            elif r['viewType'] == 'region' and t_row.get('Region') == r['level_val']:
                 match = True
            elif r['viewType'] == 'district' and t_row.get('District') == r['level_val']:
                 match = True
                 
            if match:
                 if r['name_raw'] in t_row.get('Team Members', ''):
                     team_place = t_row.get('Place', '')
                     break
        
        result = {
            'level': r['level'],
            'place': r['place'],
            'score': r['score'],
            'school': r['school'],
            'conference': r['conference'],
            'advance': r['advance'],
            'eventCode': r['eventCode'],
            'year': r['year'],
            'viewType': r['viewType'],
            'district': r['district'],
            'region': r['region'],
            'teamPlace': team_place,
            'name_raw': r['name_raw']
        }
        
        if r['eventCode'] == 'Science' and r.get('biology'):
            result['biology'] = r.get('biology', '')
            result['chemistry'] = r.get('chemistry', '')
            result['physics'] = r.get('physics', '')
            
            sci_key = (r['conference'], r['year'], r['viewType'], r['level_val'])
            sci_data = SCIENCE_INDEX.get(sci_key, [])
            
            if sci_data:
                person_bio = int(r.get('biology', 0)) if r.get('biology') else 0
                person_chem = int(r.get('chemistry', 0)) if r.get('chemistry') else 0
                person_phys = int(r.get('physics', 0)) if r.get('physics') else 0
                
                bio_rank = 1
                chem_rank = 1
                phys_rank = 1
                
                for entry in sci_data:
                    if entry['bio'] > person_bio:
                        bio_rank += 1
                    if entry['chem'] > person_chem:
                        chem_rank += 1
                    if entry['phys'] > person_phys:
                        phys_rank += 1
                
                result['bioRank'] = bio_rank
                result['chemRank'] = chem_rank
                result['physRank'] = phys_rank

        try:
            year_int = int(r['year'])
        except:
            year_int = 0
            
        event_display = r['eventDisplay']
        
        if year_int not in results_by_year:
            results_by_year[year_int] = {}
        if event_display not in results_by_year[year_int]:
            results_by_year[year_int][event_display] = []
            
        results_by_year[year_int][event_display].append(result)
    
    output = []
    for year in sorted(results_by_year.keys(), reverse=True):
        if year == 0: continue
        
        year_data = {
            'year': str(year),
            'events': []
        }
        for event in sorted(results_by_year[year].keys()):
            sorted_results = sorted(results_by_year[year][event], key=lambda x: (
                0 if 'District' in x['level'] else 1 if 'Region' in x['level'] else 2
            ))
            year_data['events'].append({
                'event': event,
                'results': sorted_results
            })
        output.append(year_data)
        
    return jsonify({
        'years': output,
        'count': sum(len(e['results']) for y in output for e in y['events'])
    })


if __name__ == '__main__':
    app.run(port=5001)
