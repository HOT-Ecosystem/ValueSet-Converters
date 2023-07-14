import {createContext, useContext,} from "react";
import {LRUCache} from 'lru-cache'; // https://isaacs.github.io/node-lru-cache
import {debounce, get, isEmpty, set, uniq, sortBy, } from 'lodash';
import {compress, decompress} from "lz-string";

/*
		TODO: get LRU cache working, one cache for each itemType, probably
 */

const DataCacheContext = createContext(null);

export function DataCacheProvider({children}) {
	const dataCache = new DataCache();
	window.addEventListener("beforeunload", dataCache.saveCache);
	window.dataCacheW = dataCache; // for debugging

	return (
			<DataCacheContext.Provider value={dataCache}>
				{children}
			</DataCacheContext.Provider>
	);
}

export function useDataCache() {
	return useContext(DataCacheContext);
}

class DataCache {
	#cache = {};

	constructor() {
		this.loadCache();
		this.sessionData = {};
	}
	setDataGetter(dataGetter) {
		this.dataGetter = dataGetter;
	}

	async fetchAndCacheItemsByKey({ itemType, keyName, keys = [], shape = 'array', /* or obj */ returnFunc, }) {
		if (isEmpty(keys)) {
			return shape === 'array' ? [] : {};
		}
		keys = keys.sort();
		keys = keys.map(String);
		if (keys.length !== uniq(keys).length) {
			throw new Error(`Why are you sending duplicate keys?`);
		}
		// use this for concepts and cset_members_items
		let wholeCache = get(this.#cache, itemType, {});
		let cachedItems = {};     // this will hold the requested items that are already cached
		let uncachedKeys = []; // requested items that still need to be fetched
		let uncachedItems = {};   // this will hold the newly fetched items

		keys.forEach(key => {
			if (wholeCache[key]) {
				cachedItems[key] = wholeCache[key];
			} else {
				uncachedKeys.push(key);
			}
		})
		if (uncachedKeys.length) {
			const data = await this.dataGetter.fetchAndCacheItems( itemType, uncachedKeys, keyName);
			// if (Array.isArray(data)) {	get this code from oneToOneFetchAndCache
			debugger;
			if (keyName) {
				if (keyName.split('.').length > 1) {
					throw new Error("write code to handle this");
				}
				// this doesn't put stuff in the cache, just in uncachedItems (obviously, but I got confused about it at one point)
				data.forEach(item => set(uncachedItems, item[keyName], item));
			} else {
				// was doing this for everything before but ending up with items assigned to the wrong keys sometimes
				// 	going forward, the server should probably return everything in a keyed dict
				debugger;
				data.forEach((item, i) => uncachedItems[uncachedKeys[i]] = item);
			}
		}
		const results = {...cachedItems, ...uncachedItems};
		const not_found = uncachedKeys.filter(key => !(key in results));
		if (not_found.length) {
			// TODO: let user see warning somehow
			console.warn(`Warning in DataCache.fetchAndCacheItemsByKey: failed to fetch ${itemType}s for ${not_found.join(', ')}`);
		}
		if (returnFunc) {
			return returnFunc(results);
		}
		if (shape === 'array') {
			let vals = Object.values(results);
			if (keyName) {	// this was an attempt to fix things assigned to wrong keys, not sure if it's needed
				vals = sortBy(vals, d => d[keyName]);
			}
			return vals;
		}
		return results;
	}

	getWholeCache() {
		return this.#cache;
	}

	getKeys() {
		return Object.keys(this.getWholeCache());
	}
	getCacheForKey(key) {
		return this.getWholeCache()[key];
	}

	saveCache = debounce(async () => {
		const before = (localStorage.getItem('dataCache') || '').length;
		this.addCacheHistoryEvent(`saving cache`);
		// TODO: use history to check if changed size *before* compressing
		const uncompressed = JSON.stringify(this.#cache);
		const compressed = compress(uncompressed);
		const after = compressed.length;
		if (before === after) { // assume compressed cache after change will be different length
			return null;
		}
		// rounding suggestion: https://stackoverflow.com/a/11832950/1368860
		let pctIncr = Math.round(10000 * (after / before + Number.EPSILON)) / 100;
		let evtMsg = `saved cache: ${uncompressed.length.toLocaleString()} uncompressed, ${compressed.length.toLocaleString()} compressed, ${pctIncr}% incr`;
		this.addCacheHistoryEvent(evtMsg);

		localStorage.setItem('dataCache', compressed);
	}, 400);

	addCacheHistoryEvent(evtMsg) {
		let evt = {
			ts: new Date(),
			evtMsg,
		};
		let cacheHistory = this.cacheGet('cacheHistory');
		if (!cacheHistory) {
			throw new Error('expected to find cacheHistory');
		}
		cacheHistory.push(evt);
		this.cachePut('cacheHistory', cacheHistory, false);
		console.log(cacheHistory);
	}
	loadCache = () => {
		let cache;
		let evtMsg;
		try {
			let compressedCache = localStorage.getItem('dataCache');
			let decompressed = decompress(compressedCache);
			this.#cache = JSON.parse(decompressed);
			evtMsg = `loaded cache: ${compressedCache.length.toLocaleString()} compressed, ${decompressed.length.toLocaleString()} decompressed`;
		} catch (error) {
			evtMsg = 'new cache';
			this.#cache = {cacheHistory: []};
		}
		this.addCacheHistoryEvent(evtMsg);
	}
	async cacheCheck(dataGetter) {
		const url = 'last-refreshed';
		const dbRefreshTimestampStr = await dataGetter.axiosCall(url, {backend: true, verbose: false, sendAlert: false});
		const dbRefreshTimestamp = new Date(dbRefreshTimestampStr);
		if (isNaN(dbRefreshTimestamp.getDate())) {
			throw new Error(`invalid date from ${url}: ${dbRefreshTimestampStr}`);
		}
		const cacheRefreshTimestampStr = this.lastRefreshed();
		const cacheRefreshTimestamp = new Date(cacheRefreshTimestampStr);
		if (isNaN(cacheRefreshTimestamp.getDate()) || dbRefreshTimestamp > cacheRefreshTimestamp) {
			console.log(`previous DB refresh: ${cacheRefreshTimestampStr}; latest DB refresh: ${dbRefreshTimestamp}. Clearing localStorage.`);
			localStorage.clear();
			// return this.#cache.lastRefreshTimestamp = dbRefreshTimestamp;
		} else {
			console.log(`no change since last refresh at ${cacheRefreshTimestamp}`);
			// return cacheRefreshTimestamp;
		}
	}

	lastRefreshed() {
		const cacheRefreshTimestampStr = get(this.#cache, 'lastRefreshTimestamp');
		return cacheRefreshTimestampStr ;
	}

	cacheGet(path) {
		// uses lodash get, so path can be array of nested keys or a string with
		//  keys delimited by .
		// so dataCache.cacheGet('concept')
		//  gets an obj of all the concepts keyed by concept_id
		// dataCache.cacheGet('concept.12345') or
		// dataCache.cacheGet(['concept', '12345'])
		//  gets the concept with concept_id 12345
		path = pathToArray(path);
		return isEmpty(path) ? this.getWholeCache() : get(this.#cache, path);
	}

	cachePut(path, value, save=true) {
		let [parentPath, parentObj,] = this.popLastPathKey(path);
		if (isEmpty(parentObj)) {
			// have to do this or numeric keys will force new obj to be an array
			set(this.#cache, parentPath, {})
		}
		set(this.#cache, path, value);
		if (save) {
			this.saveCache();
		}
	}
	cacheArrayPut(path, value, storeAsArray = false, appendToArray = false) {

		if (storeAsArray && appendToArray) {
			let val = get(this.#cache, path);
		}
	}

	popLastPathKey(path) {
		path = [...pathToArray(path)];
		const lastKey = path.pop();
		return [path, this.cacheGet(path), lastKey];
	}

	cacheDelete(path) {
		let [, parentObj, lastKey] = this.popLastPathKey(path);
		delete parentObj[lastKey];
	}

	emptyCache() {
		this.#cache = {};
	}
}

export function pathToArray(path) {
	if (isEmpty(path)) {
		return [];
	}
	if (Array.isArray(path)) {
		return path;
	}
	if (typeof (path) === 'string') {
		return path.split('.');
	}
	throw new Error(`pathToArray expects either array of keys or period-delimited string of keys, not ${path}`);
}


class DataAccessWithLRU {
	constructor() {
		this.cache = new LRUCache({
																max: 100, // number of items to keep
																maxAge: 1000 * 60 * 60, // 1 hour
															});
	}
	/*
	saveCache() {
		const data = JSON.stringify(this.cache.dump());
		localStorage.setItem('data-access-cache', data);
	}

	loadCache() {
		const data = localStorage.getItem('data-access-cache');
		if (data) {
			this.cache.load(JSON.parse(data));
		}
	}

	clearCache() {
		this.cache.reset();
		localStorage.removeItem('data-access-cache');
	}

	store_concepts_to_cache(concepts) {
		concepts.forEach(concept => {
			this.cache.set(`concepts.${concept.concept_id}`, concept);
		});
	}

	async getConcepts(concept_ids=[], shape="array") {
		let all_cached_concepts = this.cache.get('concepts');
		let cached_concepts = {};
		let uncachedConceptIds = [];
		let uncachedConcepts = {};
		concept_ids.forEach(concept_id => {
													if (all_cached_concepts && all_cached_concepts[concept_id]) {
														cached_concepts[concept_id] = all_cached_concepts[concept_id];
													} else {
														uncachedConceptIds.push(concept_id);
													}
												}
		);
		if (uncachedConceptIds.length) {
			const url = backend_url(
					"get-concepts?" + uncachedConceptIds.map(c=>`id=${c}`).join("&")
			);
		}
		const data = await fetch('concepts', url);
		data.forEach(concept => {
			uncachedConcepts[concept.concept_id] = concept;
		});
		const results = {...cached_concepts, ...uncachedConcepts};
		const not_found = concept_ids.filter(
				x => !Object.values(results).map(c=>c.concept_id).includes(x));
		if (not_found.length) {
			window.alert("Warning in dataAccess.getConcepts: couldn't find concepts for " +
											 not_found.join(', '))
		}
		if (shape === 'array') {
			return Object.values(results);
		}
		return results;
	}

	async getSubgraphEdges(concept_ids=[], format='array') {
		if (!concept_ids.length) {
			return [];
		}
		const url = backend_url(
				"subgraph?" + concept_ids.map(c=>`cid=${c}`).join("&")
		);
		const data = await fetch('subgraph', url);
		return data;
	}

	async fetch(type, url) {
		const response = await axiosCall(url);
		const data = get(response, 'data', []);
		if (type === 'concepts') {
			this.store_concepts_to_cache(data);
		}
		return data;
	}
	 */
}
