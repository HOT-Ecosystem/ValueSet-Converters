/*
TODO's
  1. Put the table back in (@Joe)
  2. Filtering & selecting 2 concept sets: (@Joe:First stab at filtering table)
    (A) keep combo box (input select list w/ an autocomplete) at the top. This box will have 2
  purposes: (i) you immediately see all the sets and their versions that are matched by what you're typing, and (ii),
  whatever you've typed in the combo box also filters the table.
  Additionally, combo box also supports multiple select (tags).
    (B) forget autocomplete and do filtering through table (might be too slow) and do multiple select by enabling
  checkboxes on table rows so even if we filter the table, if we've checked any boxes, those rows shouldn't disappear
  once the user has checked to csets they want to work with, they need a button in order to launch analysis.
  ...
  later: associated concepts: show them the concepts associated with the concept sets they've selected
  later: intensionality: also show them concept version items (intensional). but once we've got more than one cset
  selected, start doing comparison stuff
  At that point, we can share.
*/
import {useQuery} from "@tanstack/react-query";
import axios from "axios";
import AGtest from "./aggrid-test";
import {ReactQueryDevtools} from "@tanstack/react-query-devtools";
import List from "@mui/material/List";
import ListItem from "@mui/material/ListItem";
import TextField from '@mui/material/TextField';
import Autocomplete from '@mui/material/Autocomplete';
import { Link, Outlet, useHref, useNavigate, useParams, useSearchParams, useLocation } from "react-router-dom";
import React, {useState, useReducer, useEffect, useRef} from 'react';

// TODO: constantly says 'loading
function CSetsFromDisk(props) {
  // let path = 'concept-set-names';
  let path = 'cset-versions';
  let url = backend_url(path)
  let navigate = useNavigate();

  const [value, setValue] = useState([]);

  const { isLoading, error, data, isFetching } = useQuery([url], () =>
      axios
          .get(url)
          .then((res) => {
            Object.keys(res.data[0]).forEach(csetName => {
              // delete junk concept set names
              if (csetName === 'null'             || // no name
                  csetName.match(/^\d*$/) || // name is all digits
                  csetName.match(/^ /)       // name starts with space
              ) {
                // console.log(`deleting ${csetName}`)
                delete res.data[0][csetName]
              //} else {
              // console.log(`keeping ${csetName}`)
              }
            })
            // let data = Object.entries(res.data[0]).map(([csetName,v], i) => ({label: csetName, version: v[0].version, codesetId: v[0].codesetId}))
            let data = Object.entries(res.data[0]).map(([csetName,v], i) => ({label: csetName + (v.length > 1 ? ` (${v.length} versions)` : ''), versions: v.map(d=>d.version).join(', ')}))
            console.log(data)
            return data
          })
  );
  if (isLoading) return "Loading...";

  if (error) return "An error has occurred: " + error.message;
  /*
  async function csetCallback(props) {
    let {rowData, colClicked} = props
    navigate(`/OMOPConceptSet/${rowData.codesetId}`)
  }
  */

  return  (
      <div>
        <Autocomplete
          multiple
          disablePortal
          onChange={(event, newValue) => {
            setValue(newValue);
          }}
          id="combo-box-demo"
          /* options={top100Films} */
          options={data}
          sx={{ width: 300 }}
          renderInput={(params) => <TextField {...params} label="Concept set" />}
        />
        {/* <AGtest rowData={data} rowCallback={csetCallback}/>
        <pre>
          {JSON.stringify(data, null, 4)}
        </pre>
        <p>I am supposed to be the results of <a href={url}>{url}</a></p>
        */}
        <pre>selected value:
            {JSON.stringify(value, null, 2)}</pre>
        <div>{isFetching ? "Updating..." : ""}</div>
        <ReactQueryDevtools initialIsOpen />
      </div>)
  return (
    <div>
      <h3>not doing anything yet</h3>
    </div>
  )
}

  /*
      want to group by cset name and then list version. use https://mui.com/material-ui/react-autocomplete/ Grouped
      and also use Multiple Values
  <Autocomplete
  id="grouped-demo"
  options={options.sort((a, b) => -b.firstLetter.localeCompare(a.firstLetter))}
  groupBy={(option) => option.firstLetter}
  getOptionLabel={(option) => option.title}
  sx={{ width: 300 }}
  renderInput={(params) => <TextField {...params} label="With categories" />}
/>
  */

const API_ROOT = 'http://127.0.0.1:8000'
const enclave_url = path => `${API_ROOT}/passthru?path=${path}`
const backend_url = path => `${API_ROOT}/${path}`
// let url_concept_sets = enclave_url('objects/OMOPConceptSet')
let url_concept_sets = backend_url('datasets/csets')


// TODO: Fix
// Uncaught Error: Objects are not valid as a React child (found: [object Promise]). If you meant to render a collection of children, use an array instead.
//  Uncaught (in promise) TypeError: Cannot read properties of null (reading 'useContext')
async function ConceptSets(props) {
  let url = url_concept_sets
  let navigate = useNavigate();
  // https://stackoverflow.com/questions/69085220/axios-get-function-returns-a-promise-in-react
  const fetchData = async(url) => {
    return await axios.get(url).then(res => res.data);
  }
  const data = await fetchData(url);
  // const data = await axios
  //   .get(url)
  //   .then((res) => res.data )  // res.data.map(d => d.properties)
  // todo: Add this back one day because it's probably better. But for some reason setting breakpoint didn't work
  //  ...after I fixed the data.data.map -> data.map issue. And this was returning 'undefined' for `data`.
  //  - Problem 1: However later on, there was an object `rowData` with correct number of rows, but all of the rows were
  //  ...undefined. I tried making the function `async function ConceptSets` and `await useQuery` but didn't help.
  //  - Problem 2: Uncaught Error: Objects are not valid as a React child (found: [object Promise]).
  //  If you meant to render a collection of children, use an array instead.
  // const {isLoading, error, data, isFetching} = await useQuery([url], () =>
  //   axios
  //   .get(url)
  //   .then((res) => res.data))
  //   // .then((res) => res.data.map(d => d.properties)))
  // if (isLoading) return "Loading...";
  // if (error) {
  //   const err = "An error has occurred: " + error.message;
  //   console.error(err)
  //   return err
  // }
  async function csetCallback(props) {
    let {rowData, colClicked} = props
    navigate(`/OMOPConceptSet/${rowData.codesetId}`)
  }

  return (
    <div>
      <AGtest rowData={data} rowCallback={csetCallback}/>
      <pre>
          {JSON.stringify({data}, null, 4)}
      </pre>
      {/*<div>{isFetching ? "Updating..." : ""}</div>*/}
      <p>I am supposed to be the results of <a href={url}>{url}</a></p>
      <ReactQueryDevtools initialIsOpen/>
    </div>)
}

// ConceptSets attempt
// Got 'undefined' for conceptsData. Constantly in state of 'FETCHING'
// const useFetch = (url) => {
//   const cache = useRef({});
//   const initialState = {
//     status: 'idle',
//     error: null,
//     data: [],
//   };
//   const [state, dispatch] = useReducer((state, action) => {
//     console.log(action, state)
//     switch (action.type) {
//       case 'FETCHING':
//         return { ...initialState, status: 'fetching' };
//       case 'FETCHED':
//         return { ...initialState, status: 'fetched', data: action.payload };
//       case 'FETCH_ERROR':
//         return { ...initialState, status: 'error', error: action.payload };
//       default:
//         return state;
//     }
//   }, initialState);
//
//   /* useEffect: 2 params: (1) what to do / function, (2) list of observables that trigger
//   * If has only 1 param, only runs once component is mounted. */
//   useEffect(() => {
//     let cancelRequest = false;
//     if (!url) return;
//
//     const fetchData = async () => {
//       console.log(`about to fetch ${url}`)
//       dispatch({ type: 'FETCHING' });
//       if (cache.current[url]) {
//         const data = cache.current[url];
//         dispatch({ type: 'FETCHED', payload: data });
//       } else {
//         try {
//           const response = await fetch(url);
//           const data = await response.json();
//           cache.current[url] = data;
//           if (cancelRequest) return;
//           dispatch({ type: 'FETCHED', payload: data });
//           // console.log('dispatched', data)
//         } catch (error) {
//           if (cancelRequest) return;
//           dispatch({ type: 'FETCH_ERROR', payload: error.message });
//         }
//       }
//     };
//     fetchData();
//     return function cleanup() {
//       cancelRequest = true;
//     };
//   }, [url]);
//
//   console.log('useFetch returning', state )
//   return state
// };
// function ConceptSets(props) {
//   let { conceptId } = useParams();
//   function makeApiUrl() {
//     // don't hard code the prefix!! and then
//     return url_concept_sets
//   }
//   const [apiUrl, setApiUrl] = useState(makeApiUrl());
//   const [displayData, setDisplayData] = useState([]);
//   const { conceptsData } = useFetch(apiUrl);
//   /* useEffect: 2 params: (1) what to do / function, (2) list of observables that trigger
//   * If has only 1 param, only runs once component is mounted. */
//   useEffect(() => {
//     console.log('conceptsData:')
//     console.log(conceptsData)
//     if (!conceptsData) {
//       return;
//     }
//     setDisplayData([
//       {field: 'testing', value: '123'},
//     ])
//   }, [conceptsData]);
//   return (
//       <div>
//         <List>
//           <ListItem><b>Foo:</b>&nbsp;Bar<br/></ListItem>
//           {
//             displayData.map(({field, value}) =>
//               <ListItem key={field}><b>{field}:</b>&nbsp; {value}<br/></ListItem>
//             )
//           }
//         </List>
//         <Outlet/>
//         <pre>getting codesetId {conceptId} from <a href={apiUrl}>{apiUrl}</a></pre>
//       </div>
//   )
// }

// ConceptSets attempt
// Err (see useState below; probably the cause): Uncaught Error: Objects are not valid as a React child (found: [object Promise]). If you meant to render a collection of children, use an array instead.
// https://www.freecodecamp.org/news/how-to-use-axios-with-react/
// async function ConceptSets(props) {
//   let url = url_concept_sets
//   // Err: Uncaught (in promise) TypeError: Cannot read properties of null (reading 'useState')
//   const [post, setPost] = useState();
//
//   useEffect(() => {
//     axios.get(url).then((response) => {
//       setPost(response.data);
//     });
//   }, [url]);
//
//   if (!post) return null;
//
//   return (
//     <div>
//       {/*{post}*/}
//       hello
//     </div>
//   );
// }

// TODO: Constantly in state 'loding' / 'isFetching'
function ConceptSet(props) {
  let {conceptId} = useParams();
  let path = `objects/OMOPConceptSet/${conceptId}`
  let url = enclave_url(path)
  const { isLoading, error, data, isFetching } = useQuery([path], () =>
      axios
          .get(url)
          .then((res) => {
            let csetData = res.data.properties;
            return [
              {field: 'Code set ID', value: csetData.codesetId},
              {field: 'Created at', value: csetData.createdAt},
              {field: 'Version title', value: csetData.conceptSetVersionTitle},
              {field: 'Is most recent version', value: csetData.isMostRecentVersion},
              {field: 'Intention', value: csetData.intention},
              {field: 'Update message', value: csetData.updateMessage},
              {field: 'Provenance', value: csetData.provenance},
              {field: 'Limitations', value: csetData.limitations},
            ]
          })
  );

  if (isLoading) return `Loading... (isFetching: ${JSON.stringify(isFetching)}`;
  if (error) return `An error has occurred with ${<a href={url}>{url}</a>}: ` + error.message;
  return <div>
    <List>
      {
        data.map(({field, value}) =>
                     <ListItem key={field}><b>{field}:</b>&nbsp; {value}<br/></ListItem>
        )
      }
    </List>
    <ConceptList />
    {/*nothing here yet except*/}
    {/*<pre>*/}
    {/*  {JSON.stringify({data}, null, 4)}*/}
    {/*</pre>*/}
    {/*<ReactQueryDevtools initialIsOpen />*/}
  </div>
}

function ConceptList(props) {
  let params = useParams();
  let {conceptId} = params;
  let path = `objects/OMOPConceptSet/${conceptId}/links/omopconcepts`;
  let url = enclave_url(path)
  const { isLoading, error, data, isFetching } = useQuery([path], () =>
      axios
          .get(url)
          .then((res) => res.data.data.map(d => d.properties)) )
  return <div>
    <AGtest rowData={data} />
    {/*rowCallback={csetCallback}/>*/}
    <p>you want to see concepts for {conceptId}?</p>
    <pre>
      {JSON.stringify({props, params, data}, null, 2)}
    </pre>
  </div>
}

// TODO: @Joe: work on this table: it calls using enclave_wrangler. but I need to change this to pull from the Flask
//  API from disk.
function ConceptSetsTable(props) {
  let url = url_concept_sets
  let navigate = useNavigate();
  const { isLoading, error, data, isFetching } = useQuery([url], () =>
      axios
          .get(url)
          .then((res) => res.data.data.map(d => d.properties))
  );
  if (isLoading) return "Loading...";

  if (error) return "An error has occurred: " + error.message;
  async function csetCallback(props) {
    let {rowData, colClicked} = props
    navigate(`/OMOPConceptSet/${rowData.codesetId}`)
  }

  return  (
    <div>
      <AGtest rowData={data} rowCallback={csetCallback}/>
      <pre>
        {JSON.stringify({data}, null, 4)}
      </pre>
      <div>{isFetching ? "Updating..." : ""}</div>
      <p>I am supposed to be the results of <a href={url}>{url}</a></p>
      <ReactQueryDevtools initialIsOpen />
    </div>)
}

export {ConceptSets, CSetsFromDisk, ConceptSet, ConceptList};

// const top100Films = [
//   { label: 'The Shawshank Redemption', year: 1994 },
//   { label: 'The Godfather', year: 1972 },
//   { label: 'The Godfather: Part II', year: 1974 },
//   { label: 'The Dark Knight', year: 2008 },
//   { label: '12 Angry Men', year: 1957 },
//   { label: "Schindler's List", year: 1993 },
//   { label: 'Pulp Fiction', year: 1994 },
//   {
//     label: 'The Lord of the Rings: The Return of the King',
//     year: 2003,
//   },
//   { label: 'The Good, the Bad and the Ugly', year: 1966 },
//   { label: 'Fight Club', year: 1999 },
//   {
//     label: 'The Lord of the Rings: The Fellowship of the Ring',
//     year: 2001,
//   },
//   {
//     label: 'Star Wars: Episode V - The Empire Strikes Back',
//     year: 1980,
//   },
//   { label: 'Forrest Gump', year: 1994 },
//   { label: 'Inception', year: 2010 },
//   {
//     label: 'The Lord of the Rings: The Two Towers',
//     year: 2002,
//   },
//   { label: "One Flew Over the Cuckoo's Nest", year: 1975 },
//   { label: 'Goodfellas', year: 1990 },
//   { label: 'The Matrix', year: 1999 },
//   { label: 'Seven Samurai', year: 1954 },
//   {
//     label: 'Star Wars: Episode IV - A New Hope',
//     year: 1977,
//   },
//   { label: 'City of God', year: 2002 },
//   { label: 'Se7en', year: 1995 },
//   { label: 'The Silence of the Lambs', year: 1991 },
//   { label: "It's a Wonderful Life", year: 1946 },
//   { label: 'Life Is Beautiful', year: 1997 },
//   { label: 'The Usual Suspects', year: 1995 },
//   { label: 'Léon: The Professional', year: 1994 },
//   { label: 'Spirited Away', year: 2001 },
//   { label: 'Saving Private Ryan', year: 1998 },
//   { label: 'Once Upon a Time in the West', year: 1968 },
//   { label: 'American History X', year: 1998 },
//   { label: 'Interstellar', year: 2014 },
//   { label: 'Casablanca', year: 1942 },
//   { label: 'City Lights', year: 1931 },
//   { label: 'Psycho', year: 1960 },
//   { label: 'The Green Mile', year: 1999 },
//   { label: 'The Intouchables', year: 2011 },
//   { label: 'Modern Times', year: 1936 },
//   { label: 'Raiders of the Lost Ark', year: 1981 },
//   { label: 'Rear Window', year: 1954 },
//   { label: 'The Pianist', year: 2002 },
//   { label: 'The Departed', year: 2006 },
//   { label: 'Terminator 2: Judgment Day', year: 1991 },
//   { label: 'Back to the Future', year: 1985 },
//   { label: 'Whiplash', year: 2014 },
//   { label: 'Gladiator', year: 2000 },
//   { label: 'Memento', year: 2000 },
//   { label: 'The Prestige', year: 2006 },
//   { label: 'The Lion King', year: 1994 },
//   { label: 'Apocalypse Now', year: 1979 },
//   { label: 'Alien', year: 1979 },
//   { label: 'Sunset Boulevard', year: 1950 },
//   {
//     label: 'Dr. Strangelove or: How I Learned to Stop Worrying and Love the Bomb',
//     year: 1964,
//   },
//   { label: 'The Great Dictator', year: 1940 },
//   { label: 'Cinema Paradiso', year: 1988 },
//   { label: 'The Lives of Others', year: 2006 },
//   { label: 'Grave of the Fireflies', year: 1988 },
//   { label: 'Paths of Glory', year: 1957 },
//   { label: 'Django Unchained', year: 2012 },
//   { label: 'The Shining', year: 1980 },
//   { label: 'WALL·E', year: 2008 },
//   { label: 'American Beauty', year: 1999 },
//   { label: 'The Dark Knight Rises', year: 2012 },
//   { label: 'Princess Mononoke', year: 1997 },
//   { label: 'Aliens', year: 1986 },
//   { label: 'Oldboy', year: 2003 },
//   { label: 'Once Upon a Time in America', year: 1984 },
//   { label: 'Witness for the Prosecution', year: 1957 },
//   { label: 'Das Boot', year: 1981 },
//   { label: 'Citizen Kane', year: 1941 },
//   { label: 'North by Northwest', year: 1959 },
//   { label: 'Vertigo', year: 1958 },
//   {
//     label: 'Star Wars: Episode VI - Return of the Jedi',
//     year: 1983,
//   },
//   { label: 'Reservoir Dogs', year: 1992 },
//   { label: 'Braveheart', year: 1995 },
//   { label: 'M', year: 1931 },
//   { label: 'Requiem for a Dream', year: 2000 },
//   { label: 'Amélie', year: 2001 },
//   { label: 'A Clockwork Orange', year: 1971 },
//   { label: 'Like Stars on Earth', year: 2007 },
//   { label: 'Taxi Driver', year: 1976 },
//   { label: 'Lawrence of Arabia', year: 1962 },
//   { label: 'Double Indemnity', year: 1944 },
//   {
//     label: 'Eternal Sunshine of the Spotless Mind',
//     year: 2004,
//   },
//   { label: 'Amadeus', year: 1984 },
//   { label: 'To Kill a Mockingbird', year: 1962 },
//   { label: 'Toy Story 3', year: 2010 },
//   { label: 'Logan', year: 2017 },
//   { label: 'Full Metal Jacket', year: 1987 },
//   { label: 'Dangal', year: 2016 },
//   { label: 'The Sting', year: 1973 },
//   { label: '2001: A Space Odyssey', year: 1968 },
//   { label: "Singin' in the Rain", year: 1952 },
//   { label: 'Toy Story', year: 1995 },
//   { label: 'Bicycle Thieves', year: 1948 },
//   { label: 'The Kid', year: 1921 },
//   { label: 'Inglourious Basterds', year: 2009 },
//   { label: 'Snatch', year: 2000 },
//   { label: '3 Idiots', year: 2009 },
//   { label: 'Monty Python and the Holy Grail', year: 1975 },
// ];
//
