# TermHub

## [Features under development / consideration](https://docs.google.com/spreadsheets/d/19_eBv0MIBWPcXMTw3JJdcfPoEFhns93F-TKdODW27B8/edit#gid=0)
More info: [Requirements](https://github.com/jhu-bids/TermHub/issues/72)

### Vocabulary management (a single concept, subsets of or an entire vocabulary)
The simple concept vocabulary mapping, SNOMED, etc.

### One concept set (cset)
A grouping of vocabularies (single concepts) that make up a particular value set. This entails user-based tagging. 

(Siggie?) The vocabulary that deals with just concept IDs and terminologies but also there is a part that deals with presence of these terminologies within your data source. 

Description of API needed outside enclave in order to do cset analysis:
(see Siggie's spreadsheet: https://roamresearch.com/#/app/jhu-bids/page/RsLm1drBI)

### multiple csets
--includes single cset to a revised single cset (version compare)
--similar/related csets
--combination of csets

managing multiple csets may include single cset comparisons, either one cset compared to another, or a single cset version comparison. It can include neighborhods or similar, related csets. Or, it can be a combination of csets for a broader category.

### Documentation and associated metadata
Source, Limitations, Intention

Identifying/labeling sets of csets: 
--bundles, 
--approved
--reviewed 
--published 
--externally curated, etc.

### Neighborhood analysis
Documentation and visualization;
reviewing, understanding, what is in the sets

Identifying neighborhoods
--what is similar/different
-- properties (articulating why they are different)
User Interactions
--select, relabel, groupings, 

### Review Process of cset(s)

### Validation
(is this the same as Review? maybe not)

### Choosing concept sets for Logic Liaison templates

### Archiving

### Editing Concepts & Concept Sets

## Developer docs
- [Frontend](./frontend/README.md)  
- [Backend](./backend/README.md)

### Local setup
1. Clone the repository.
2. Run: `pip install -r requirements.txt`
3. Run `git submodule update`
4. Set up PostgreSQL  
5. Basic DB setup
```shell
$ psql
# you're now connected to postgres. run these commands:
CREATE DATABASE termhub;
exit
# reconnect to new db:
$ psql termhub
# connected again to postgres. run:
CREATE SCHEMA n3c;
SET search_path TO n3c;
```
6. Create DB structure and load data
7. Run: `python backend/db/initialize.py`

### Deployment
#### Deploying the backend
1. Clone the repository.
2. Run: `pip install -r requirements.txt`
3. Run `git submodule update`
4. Run: `uvicorn backend.app:APP --reload`

#### Deploying the frontend
1. `cd frontend; npm run build`
2. When that process completes, you should now have an updated `frontend/build` directory. This can be deployed as a static site. The entry point is `index.html`.
