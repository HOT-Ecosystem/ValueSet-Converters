"""Main module
# Resources
- Reference google sheets:
  - Source data: https://docs.google.com/spreadsheets/d/1jzGrVELQz5L4B_-DqPflPIcpBaTfJOUTrVJT5nS_j18/edit#gid=1335629675
  - Source data (old): https://docs.google.com/spreadsheets/d/17hHiqc6GKWv9trcW-lRnv-MhZL8Swrx2/edit#gid=1335629675
  - Output example: https://docs.google.com/spreadsheets/d/1uroJbhMmOTJqRkTddlSNYleSKxw4i2216syGUSK7ZuU/edit?userstoinvite=joeflack4@gmail.com&actionButton=1#gid=435465078
"""
import json
import os
import pickle
import sys
from copy import copy
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List, OrderedDict
from uuid import uuid4

import pandas as pd

try:
    import ArgumentParser
except ModuleNotFoundError:
    from argparse import ArgumentParser

from vsac_wrangler.config import CACHE_DIR, DATA_DIR, PROJECT_ROOT
from vsac_wrangler.definitions.constants import FHIR_JSON_TEMPLATE
from vsac_wrangler.google_sheets import get_sheets_data
from vsac_wrangler.vsac_api import get_ticket_granting_ticket, get_value_sets
from vsac_wrangler.interfaces._cli import get_parser


# USER1: This is an actual ID to a valid user in palantir, who works on our BIDS team.
PROJECT_NAME = 'RP-4A9E27'
PALANTIR_ENCLAVE_USER_ID_1 = 'a39723f3-dc9c-48ce-90ff-06891c29114f'

PARSE_ARGS = get_parser().parse_args()  # for convenient access later

OUTPUT_NAME ='palantir-three-file' # currently this is the only value used
SOURCE_NAME ='vsac'


def get_runtime_provenance() -> str:
    """Get provenance info related to this runtime operation"""
    return f'oids from {PARSE_ARGS.input_path} => VSAC trad API => 3-file dir {get_out_dir()}'


def format_label(label, verbose_prefix=False) -> str:
    """Adds prefix and trims whitespace"""
    label = label.strip()
    prefix = 'VSAC' if not verbose_prefix else get_runtime_provenance()
    return f'[{prefix}] {label}'

def get_out_dir(output_name=OUTPUT_NAME, source_name=SOURCE_NAME) -> str:
    date_str = datetime.now().strftime('%Y.%m.%d')
    out_dir = os.path.join(DATA_DIR, output_name, source_name, date_str, 'output')
    return out_dir

# to-do: Shared lib for this stuff?
# noinspection DuplicatedCode
def _save_csv(df: pd.DataFrame, filename, output_name=OUTPUT_NAME, source_name=SOURCE_NAME, field_delimiter=','):
    """Side effects: Save CSV"""
    out_dir = get_out_dir(output_name=output_name, source_name=source_name)
    os.makedirs(out_dir, exist_ok=True)
    output_format = 'csv' if field_delimiter == ',' else 'tsv' if field_delimiter == '\t' else 'txt'
    outpath = os.path.join(out_dir, f'{filename}.{output_format}')
    df.to_csv(outpath, sep=field_delimiter, index=False)


def _datetime_palantir_format() -> str:
    """Returns datetime str in format used by palantir data enclave
    e.g. 2021-03-03T13:24:48.000Z (milliseconds allowed, but not common in observed table)"""
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%fZ")[:-4] + 'Z'


def save_json(value_sets, output_structure, json_indent=4) -> List[Dict]:
    """Save JSON"""
    # Populate JSON objs
    d_list: List[Dict] = []
    for value_set in value_sets:
        value_set2 = {}
        if output_structure == 'fhir':
            value_set2 = vsac_to_fhir(value_set)
        elif output_structure == 'vsac':
            value_set2 = vsac_to_vsac(value_set)
        elif output_structure == 'atlas':
            raise NotImplementedError('For "atlas" output-structure, output-format "json" not yet implemented.')
        d_list.append(value_set2)

    # Save file
    for d in d_list:
        if 'name' in d:
            valueset_name = d['name']
        else:
            valueset_name = d['Concept Set Name']
        valueset_name = valueset_name.replace('/', '|')
        filename = valueset_name + '.json'
        filepath = os.path.join(DATA_DIR, filename)
        with open(filepath, 'w') as fp:
            if json_indent:
                json.dump(d, fp, indent=json_indent)
            else:
                json.dump(d, fp)

    return d_list


# TODO: repurpose this to use VSAC format
# noinspection DuplicatedCode
def vsac_to_fhir(value_set: Dict) -> Dict:
    """Convert VSAC JSON dict to FHIR JSON dict"""
    # TODO: cop/paste FHIR_JSON_TEMPLATE literally here instead and use like other func
    d: Dict = copy(FHIR_JSON_TEMPLATE)
    d['id'] = int(value_set['valueSet.id'][0])
    d['text']['div'] = d['text']['div'].format(value_set['valueSet.description'][0])
    d['url'] = d['url'].format(str(value_set['valueSet.id'][0]))
    d['name'] = value_set['valueSet.name'][0]
    d['title'] = value_set['valueSet.name'][0]
    d['status'] = value_set['valueSet.status'][0]
    d['description'] = value_set['valueSet.description'][0]
    d['compose']['include'][0]['system'] = value_set['valueSet.codeSystem'][0]
    d['compose']['include'][0]['version'] = value_set['valueSet.codeSystemVersion'][0]
    concepts = []
    d['compose']['include'][0]['concept'] = concepts

    return d


# TODO:
def vsac_to_vsac(v: Dict, depth=2) -> Dict:
    """Convert VSAC JSON dict to OMOP JSON dict
    This is the format @DaveraGabriel specified by looking at the VSAC web interface."""
    # Attempt at regexp
    # Clinical Focus: Asthma conditions which suggest applicability of NHLBI NAEPP EPR3 Guidelines for the Diagnosis and
    # Management of Asthma (2007) and the 2020 Focused Updates to the Asthma Management Guidelines),(Data Element Scope:
    # FHIR Condition.code),(Inclusion Criteria: SNOMEDCT concepts in "Asthma SCT" and ICD10CM concepts in "Asthma
    # ICD10CM" valuesets.),(Exclusion Criteria: none)
    # import re
    # regexer = re.compile('\((.+): (.+)\)')  # fail
    # regexer = re.compile('\((.+): (.+)\)[,$]')
    # found = regexer.match(value_sets['ns0:Purpose'])
    # x1 = found.groups()[0]

    purposes = v['ns0:Purpose'].split('),')
    d = {
        "Concept Set Name": v['@displayName'],
        "Created At": 'vsacToOmopConversion:{}; vsacRevision:{}'.format(
            datetime.now().strftime('%Y/%m/%d'),
            v['ns0:RevisionDate']),
        "Created By": v['ns0:Source'],
        # "Created By": "https://github.com/HOT-Ecosystem/ValueSet-Converters",
        "Intention": {
            "Clinical Focus": purposes[0].split('(Clinical Focus: ')[1],
            "Inclusion Criteria": purposes[2].split('(Inclusion Criteria: ')[1],
            "Data Element Scope": purposes[1].split('(Data Element Scope: ')[1],
            "Exclusion Criteria": purposes[3].split('(Exclusion Criteria: ')[1],
        },
        "Limitations": {
            "Exclusion Criteria": "",
            "VSAC Note": None,  # VSAC Note: (exclude if null)
        },
        "Provenance": {
            "Steward": "",
            "OID": "",
            "Code System(s)": [],
            "Definition Type": "",
            "Definition Version": "",
        }
    }
    # TODO: use depth to make this either nested JSON, or, if depth=1, concatenate
    #  ... all intention sub-fields into a single string, etc.
    if depth == 1:
        d['Intention'] = ''
    elif depth < 1 or depth > 2:
        raise RuntimeError(f'vsac_to_vsac: depth parameter valid range: 1-2, but depth of {depth} was requested.')

    return d


def get_vsac_csv(
    value_sets: List[OrderedDict], google_sheet_name=None, field_delimiter=',', code_delimiter='|', filename='vsac_csv'
) -> pd.DataFrame:
    """Convert VSAC hiearchical XML in a VSAC-oriented tabular file"""
    rows = []
    for value_set in value_sets:
        code_system_codes = {}
        name = value_set['@displayName']
        purposes = value_set['ns0:Purpose'].split('),')
        purposes2 = []
        for p in purposes:
            i1 = 1 if p.startswith('(') else 0
            i2 = -1 if p[len(p) - 1] == ')' else len(p)
            purposes2.append(p[i1:i2])

        concepts = value_set['ns0:ConceptList']['ns0:Concept']
        concepts = concepts if type(concepts) == list else [concepts]
        for concept in concepts:
            code = concept['@code']
            code_system = concept['@codeSystemName']
            if code_system not in code_system_codes:
                code_system_codes[code_system] = []
            code_system_codes[code_system].append(code)

        for code_system, codes in code_system_codes.items():
            row = {
                'name': name,
                'nameVSAC': '[VSAC] ' + name,
                'oid': value_set['@ID'],
                'codeSystem': code_system,
                'limitations': purposes2[3],
                'intention': '; '.join(purposes2[0:3]),
                'provenance': '; '.join([
                    'Steward: ' + value_set['ns0:Source'],
                    'OID: ' + value_set['@ID'],
                    'Code System(s): ' + ','.join(list(code_system_codes.keys())),
                    'Definition Type: ' + value_set['ns0:Type'],
                    'Definition Version: ' + value_set['@version'],
                    'Accessed: ' + str(datetime.now())[0:-7]
                ]),
            }
            if len(codes) < 2000:
                row['codes'] = code_delimiter.join(codes)
            else:
                row['codes'] = code_delimiter.join(codes[0:1999])
                if len(codes) < 4000:
                    row['codes2'] = code_delimiter.join(codes[2000:])
                else:
                    row['codes2'] = code_delimiter.join(codes[2000:3999])
                    row['codes3'] = code_delimiter.join(codes[4000:])
            row2 = {}
            for k, v in row.items():
                row2[k] = v.replace('\n', ' - ') if type(v) == str else v
            row = row2
            rows.append(row)

    # Create/Return DF & Save CSV
    df = pd.DataFrame(rows)
    _save_csv(df, filename=filename, source_name=google_sheet_name, field_delimiter=field_delimiter)

    return df


def get_ids_for_palantir3file(value_sets: pd.DataFrame) -> Dict[str, int]:
    oid_enclave_code_set_id_map_csv_path = os.path.join(PROJECT_ROOT, 'data', 'cset.csv')
    oid_enclave_code_set_id_df = pd.read_csv(oid_enclave_code_set_id_map_csv_path)

    missing_oids = set(value_sets['@ID']) - set(oid_enclave_code_set_id_df['oid'])
    if len(missing_oids) > 0:
        google_sheet_url = PARSE_ARGS.google_sheet_url
        new_ids = [
            id for id in oid_enclave_code_set_id_df.internal_id.max() + 1 + range(0, len(missing_oids))]

        missing_recs = pd.DataFrame(data={
            'source_id_field': ['oid' for i in range(0, len(missing_oids))],
            'oid': [oid for oid in missing_oids],
            'ccsr_code': [None for i in range(0, len(missing_oids))],
            'internal_id': new_ids,
            'internal_source': [google_sheet_url for i in range(0, len(missing_oids))],
            'cset_source': ['VSAC' for i in range(0, len(missing_oids))],
            'grouped_by_bids': [None for i in range(0, len(missing_oids))],
            'concept_id': [None for i in range(0, len(missing_oids))],
        })
        oid_enclave_code_set_id_df = pd.concat([oid_enclave_code_set_id_df, missing_recs])
        oid_enclave_code_set_id_df.to_csv(oid_enclave_code_set_id_map_csv_path, index=False)

    oid__codeset_id_map = dict(zip(
        oid_enclave_code_set_id_df['oid'],
        oid_enclave_code_set_id_df['internal_id']))

    return oid__codeset_id_map


def get_palantir_csv(
    value_sets: pd.DataFrame, source_name='vsac', field_delimiter=',',
    filename1='concept_set_version_item_rv_edited', filename2='code_sets', filename3='concept_set_container_edited'
) -> Dict[str, pd.DataFrame]:
    """Convert VSAC hiearchical XML to CSV compliant w/ Palantir's OMOP-inspired concept set editor data model"""

    # I. Create IDs that will be shared between files
    oid__codeset_id_map = get_ids_for_palantir3file(value_sets)


    # II. Create & save exports
    _all = {}
    # 1. Palantir enclave table: concept_set_version_item_rv_edited
    rows1 = []
    for i, value_set in value_sets.iterrows():
        codeset_id = oid__codeset_id_map[value_set['@ID']]
        for concept in value_set['concepts']:
            code = concept['@code']
            code_system = concept['@codeSystemName']
            # The 3 fields isExcluded, includeDescendants, and includeMapped, are from OMOP but also in VSAC. If it has
            # ...these 3 options, it is intensional. And when you execute these 3, it is now extensional / expansion.
            row = {
                'codeset_id': codeset_id,
                'concept_id': '',  # leave blank for now
                # <non-palantir fields>
                'code': code,
                'codeSystem': code_system,
                # </non-palantir fields>
                'isExcluded': False,
                'includeDescendants': True,
                'includeMapped': False,
                'item_id': str(uuid4()),  # will let palantir verify ID is indeed unique
                # TODO: @Stephanie: Is there any annotation we want at all?
                # 'annotation': json.dumps({
                #     'when': str(datetime.now().strftime('%Y-%m-%d')),
                #     'who': 'Data Ingest & Harmonization (DIH)',
                #     'project': 'N3C-enclave-import',
                #     'oids-source': PARSE_ARGS.input_path,
                #     'generation-process': get_runtime_provenance(),
                #     'valueset-source': 'VSAC',
                # }),
                # 'annotation': '; '.join([
                #     'when: ' + str(datetime.now().strftime('%Y-%m-%d')),
                #     'who: ' + 'Data Ingest & Harmonization (DIH)',
                #     'project: ' + 'N3C-enclave-import',
                #     'oids-source: ' + PARSE_ARGS.input_path,
                #     'generation-process: ' + get_runtime_provenance(),
                #     'valueset-source: ' + 'VSAC',
                # ]),
                'annotation': '',
                # 'created_by': 'DI&H Bulk Import',
                'created_by': PALANTIR_ENCLAVE_USER_ID_1,
                'created_at': _datetime_palantir_format()
            }
            row2 = {}
            for k, v in row.items():
                row2[k] = v.replace('\n', ' - ') if type(v) == str else v
            row = row2
            rows1.append(row)
    df1 = pd.DataFrame(rows1)
    _all[filename1] = df1
    _save_csv(
        df1, filename=filename1, source_name=source_name, field_delimiter=field_delimiter)

    # 2. Palantir enclave table: code_sets
    rows2 = []
    for i, value_set in value_sets.iterrows():
        codeset_id = oid__codeset_id_map[value_set['@ID']]
        concept_set_name = format_label(value_set['@displayName'])
        purposes = value_set['ns0:Purpose'].split('),')
        purposes2 = []
        for p in purposes:
            i1 = 1 if p.startswith('(') else 0
            i2 = -1 if p[len(p) - 1] == ')' else len(p)
            purposes2.append(p[i1:i2])
        code_system_codes = {}
        code_systems = []
        for concept in value_set['concepts']:
            code = concept['@code']
            code_system = concept['@codeSystemName']
            if code_system not in code_system_codes:
                code_system_codes[code_system] = []
            if code_system not in code_systems:
                code_systems.append(code_system)
            code_system_codes[code_system].append(code)
        # concept_set_name = concept_set_name + ' ' + '(' + ';'.join(code_systems) + ')'
        row = {
            # 'codeset_id': oid__codeset_id_map[value_set['@ID']],
            # 'codeset_id': value_set['@displayName'],
            'codeset_id': codeset_id,
            'concept_set_name': concept_set_name,
            'concept_set_version_title': concept_set_name + ' (v1)',
            'project': PROJECT_NAME,  # always use this project id for bulk import
            'source_application': 'EXTERNAL VSAC',
            'source_application_version': '',  # nullable
            'created_at': _datetime_palantir_format(),
            'atlas_json': '',  # nullable
            'is_most_recent_version': True,
            'version': 1,
            'comments': 'Exported from VSAC and bulk imported to N3C.',
            'intention': '; '.join(purposes2[0:3]),  # nullable
            'limitations': purposes2[3],  # nullable
            'issues': '',  # nullable
            'update_message': 'Initial version.',  # nullable (maybe?)
            # status field stats as appears in the code_set table 2022/01/12:
            # 'status': [
            #     '',  # null
            #     'Finished',
            #     'In Progress',
            #     'Awaiting Review',
            #     'In progress',
            # ][2],
            # status field doesn't show this in stats in code_set table, but UI uses this value by default:
            'status': 'Under Construction',
            'has_review': '',  # boolean (nullable)
            'reviewed_by': '',  # nullable
            'created_by': PALANTIR_ENCLAVE_USER_ID_1,
            'authority': value_set['ns0:Source'],
            'provenance': '; '.join([
                    'Steward: ' + value_set['ns0:Source'],
                    'OID: ' + value_set['@ID'],
                    'dih_id: ' + str(codeset_id),
                    'Code System(s): ' + ','.join(list(code_system_codes.keys())),
                    'Definition Type: ' + value_set['ns0:Type'],
                    'Definition Version: ' + value_set['@version'],
                    'Accessed: ' + str(datetime.now())[0:-7]
            ]),
            'atlas_json_resource_url': '',  # nullable
            # null, initial version will not have the parent version so this field would be always null:
            'parent_version_id': '',  # nullable
            # True ( after the import view it from the concept set editor to review the concept set and click done.
            # We can add the comments like we imported from VSAC and reviewed it from the concept set editor. )
            # 1. import 2. manual check 3 click done to finish the definition. - if we want to manually review them
            # first and click Done:
            'is_draft': True,
        }
        row2 = {}
        for k, v in row.items():
            row2[k] = v.replace('\n', ' - ') if type(v) == str else v
        row = row2
        rows2.append(row)
    df2 = pd.DataFrame(rows2)
    _all[filename2] = df2
    df2['enclave_codeset_id'] = ''
    df2['enclave_codeset_id_updated_at'] = ''
    _save_csv(
        df2, filename=filename2, source_name=source_name, field_delimiter=field_delimiter)

    # 3. Palantir enclave table: concept_set_container_edited
    rows3 = []
    for i, value_set in value_sets.iterrows():
        purposes = value_set['ns0:Purpose'].split('),')
        purposes2 = []
        for p in purposes:
            i1 = 1 if p.startswith('(') else 0
            i2 = -1 if p[len(p) - 1] == ')' else len(p)
            purposes2.append(p[i1:i2])
        concept_set_name = format_label(value_set['@displayName'])

        code_systems = []
        for concept in value_set['concepts']:
            code_system = concept['@codeSystemName']
            if code_system not in code_systems:
                code_systems.append(code_system)
        # concept_set_name = concept_set_name + ' ' + '(' + ';'.join(code_systems) + ')'

        row = {
            'concept_set_id': concept_set_name,
            'concept_set_name': concept_set_name,
            'project_id': '',  # nullable
            'assigned_informatician': PALANTIR_ENCLAVE_USER_ID_1,  # nullable
            'assigned_sme': PALANTIR_ENCLAVE_USER_ID_1,  # nullable
            'status': ['Finished', 'Under Construction', 'N3C Validation Complete'][1],
            'stage': [
                'Finished',
                'Awaiting Editing',
                'Candidate for N3C Review',
                'Awaiting N3C Committee Review',
                'Awaiting SME Review',
                'Under N3C Committee Review',
                'Under SME Review',
                'N3C Validation Complete',
                'Awaiting Informatician Review',
                'Under Informatician Review',
            ][1],
            'intention': '; '.join(purposes2[0:3]),
            'n3c_reviewer': '',  # nullable
            'alias': None,
            'archived': False,
            # 'created_by': 'DI&H Bulk Import',
            'created_by': PALANTIR_ENCLAVE_USER_ID_1,
            'created_at': _datetime_palantir_format()
        }

        row2 = {}
        for k, v in row.items():
            row2[k] = v.replace('\n', ' - ') if type(v) == str else v
        row = row2

        rows3.append(row)
    df3 = pd.DataFrame(rows3)
    _all[filename3] = df3
    _save_csv(
        df3, filename=filename3, source_name=source_name, field_delimiter=field_delimiter)

    return _all


def fix_vsac_api_structure(value_sets: List[OrderedDict]) -> pd.DataFrame:
    """Fixes structure and removes empty sets
    Structure fixes:
        - Gets rid of useless ns0:... stuff in vsac api value sets
        - Fixes name collisions (fixed rows move to the top)
        - converts from OrderedDict to DataFrame"""
    warning = 'VSAC returned 0 concepts in the following value set and will be skipped:\n- oid: {oid}\n- name: {name}'
    key1 = 'ns0:ConceptList'
    value_sets2: List[OrderedDict] = []
    for value_set in value_sets:
        try:
            concepts = value_set[key1]['ns0:Concept']
        except TypeError:
            if value_set[key1] is None:
                warning = warning.format(
                    oid=value_set['@ID'],
                    name='@displayName')
                print(warning, file=sys.stderr)
            continue
        concepts = concepts if type(concepts) == list else [concepts]
        value_set.pop('ns0:ConceptList')
        value_set['concepts'] = concepts
        value_sets2.append(value_set)

    vsets = pd.DataFrame(value_sets2)
    rows_by_name = vsets.groupby('@displayName')
    rows_with_name_collisions = rows_by_name.filter(lambda x: len(x) > 1)
    rows_without = rows_by_name.filter(lambda x: len(x) == 1)

    # append last 3 of oid
    # append_oid_part_to_name = lambda row: f'{row["Name"]} {}'
    last_oid_parts = rows_with_name_collisions['@ID'].str.split('.').apply(lambda parts: parts[-1])
    rows_with_name_collisions['@displayName'] =\
        rows_with_name_collisions['@displayName'] + ' ' + last_oid_parts

    df = pd.concat([rows_with_name_collisions, rows_without])

    # Fix cases of codeSystem appearing in @displayName
    def name_fixer(name) -> str:
        """Fixes names"""
        snomed_cases = [
            'SNOMEDCT',
            'SNOMED CT',
            'SNOMED',
            'SCT',
            'SM CT']
        for case in snomed_cases:
            wrapped = f'({case})'
            name = name.replace(wrapped, '')
            name = name.replace(case, '')
        return name
    df['@displayName'] = df['@displayName'].apply(name_fixer)

    return df

def run(
    input_source_type=['google-sheet', 'txt', 'csv'][-1],
    google_sheet_name=None,
    google_sheet_url=None,  # not passing this. just grabbing it from argparse when i need it
    output_format=['tabular/csv', 'json'][0],
    output_structure=['fhir', 'vsac', 'palantir-concept-set-tables', 'atlas', 'normalized'][-1],
            # confusing...normalized is not implemented, right?

    tabular_field_delimiter=[',', '\t'][0],
    tabular_intra_field_delimiter=[',', ';', '|'][2],
    json_indent=4, use_cache=False, input_path=None,
):
    """Main function
    Refer to interfaces/cli.py for argument descriptions."""
    value_sets = []
    pickle_filename = f'value_sets_{input_source_type}' + google_sheet_name.replace(' ', '-').replace('/', '-').replace('\\', '') if google_sheet_name else '' \
        + input_path.replace(' ', '-').replace('/', '-').replace('\\', '') if input_path else '' + '.pickle'
    pickle_file = Path(CACHE_DIR, pickle_filename)

    if use_cache:
        if pickle_file.is_file() and use_cache:
            value_sets = pickle.load(open(pickle_file, 'rb'))
        else:
            use_cache = False
    if not use_cache:
        # 1/3 Get OIDs to query
        # TODO: Get a different API_Key for this than Joe's 'ohbehave' project
        object_ids: List[str] = []
        if input_source_type == 'google-sheet':
            df: pd.DataFrame = get_sheets_data(google_sheet_name)
            if 'DoNotLoad' in df.columns:
                df = df[df['DoNotLoad'] != True]
            try:
                object_ids = [x for x in list(df['OID']) if x != '']
            except KeyError:
                object_ids = [x for x in list(df['oid']) if x != '']
        elif input_source_type in ['txt', 'csv']:
            if not Path(input_path).is_file():
                input_path = Path(os.getcwd(), input_path)
                if not Path(input_path).is_file():
                    raise FileNotFoundError(input_path)
        if input_source_type == 'txt':
            with open(input_path, 'r') as f:
                object_ids = [oid.rstrip() for oid in f.readlines()]
        elif input_source_type == 'csv':
            df = pd.read_csv(input_path).fillna('')
            # added new column to spreadsheet for rows not to include
            if 'DoNotLoad' in df.columns:
                df = df[df['DoNotLoad'] != True]
            try:        # the most recent spreadsheet has OID instead of oid
                object_ids = list(df['oid'])
            except KeyError:
                object_ids = list(df['OID'])
            object_ids = [x for x in object_ids if x]

        # 2/3: Query VSAC
        tgt: str = get_ticket_granting_ticket()

        value_sets: List[OrderedDict] = get_value_sets(object_ids, tgt)

        # Save to cache
        with open(pickle_file, 'wb') as handle:
            pickle.dump(value_sets, handle, protocol=pickle.HIGHEST_PROTOCOL)

    # 3/3: Generate output
    if output_format == 'tabular/csv':
        if output_structure == 'normalized':
            raise NotImplementedError('Not implemented.')
        elif output_structure == 'vsac':
            raise NotImplementedError('is output_structure vsac ever used? if you are seeing this, then yes.')
            get_vsac_csv(value_sets, google_sheet_name, tabular_field_delimiter, tabular_intra_field_delimiter)
        elif output_structure == 'palantir-concept-set-tables':
            value_sets: pd.DataFrame = fix_vsac_api_structure(value_sets)
            get_palantir_csv(value_sets, field_delimiter=tabular_field_delimiter)
        elif output_structure == 'fhir':
            raise NotImplementedError('output_structure "fhir" not available for output_format "csv/tabular".')
    elif output_format == 'json':
        raise NotImplementedError('is output_format json ever used? if you are seeing this, then yes.')
        save_json(value_sets, output_structure, json_indent)
