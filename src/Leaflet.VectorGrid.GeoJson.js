
import Pbf from 'pbf';
import {VectorTile} from '@mapbox/vector-tile';

/*
 * 🍂class VectorGrid.GeoJson
 * 🍂extends VectorGrid
 *
 * A `VectorGrid` for vector tiles fetched from the internet.
 * Tiles are supposed to be GaoJson,
 * containing data which complies with the
 * [MapBox Vector Tile Specification](https://github.com/mapbox/vector-tile-spec/tree/master/2.1).
 *
 * This is the format used by:
 * - Mapbox Vector Tiles
 * - Mapzen Vector Tiles
 * - ESRI Vector Tiles
 * - [OpenMapTiles hosted Vector Tiles](https://openmaptiles.com/hosting/)
 *
 * 🍂example
 *
 * You must initialize a `VectorGrid.GeoJson` with a URL template, just like in
 * `L.TileLayer`s. The difference is that the template must point to vector tiles
 * (usually `.geojson`, `.geo.json` or `.json`) instead of raster (`.png` or `.jpg`) tiles, and that
 * you should define the styling for all the features.
 *
 * <br><br>
 *
 * For OpenMapTiles, with a key from [https://openmaptiles.org/docs/host/use-cdn/](https://openmaptiles.org/docs/host/use-cdn/),
 * initialization looks like this:
 *
 * ```
 * L.vectorGrid.geojson("https://free-{s}.tilehosting.com/data/v3/{z}/{x}/{y}.geojson.pict?key={key}", {
 * 	vectorTileLayerStyles: { ... },
 * 	subdomains: "0123",
 * 	key: 'abcdefghi01234567890',
 * 	maxNativeZoom: 14
 * }).addTo(map);
 * ```
 *
 * And for Mapbox vector tiles, it looks like this:
 *
 * ```
 * L.vectorGrid.geojson("https://{s}.tiles.mapbox.com/v4/mapbox.mapbox-streets-v6/{z}/{x}/{y}.vector.geojson?access_token={token}", {
 * 	vectorTileLayerStyles: { ... },
 * 	subdomains: "abcd",
 * 	token: "pk.abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRTS.TUVWXTZ0123456789abcde"
 * }).addTo(map);
 * ```
 */
L.VectorGrid.GeoJson = L.VectorGrid.extend({

	options: {
		// 🍂section
		// As with `L.TileLayer`, the URL template might contain a reference to
		// any option (see the example above and note the `{key}` or `token` in the URL
		// template, and the corresponding option).
		//
		// 🍂option subdomains: String = 'abc'
		// Akin to the `subdomains` option for `L.TileLayer`.
		subdomains: 'abc',	// Like L.TileLayer
		//
		// 🍂option fetchOptions: Object = {}
		// options passed to `fetch`, e.g. {credentials: 'same-origin'} to send cookie for the current domain
		fetchOptions: {}
	},

	initialize: function(url, options) {
		// Inherits options from geojson-vt!
// 		this._slicer = geojsonvt(geojson, options);
		this._url = url;
		L.VectorGrid.prototype.initialize.call(this, options);
	},

	// 🍂method setUrl(url: String, noRedraw?: Boolean): this
	// Updates the layer's URL template and redraws it (unless `noRedraw` is set to `true`).
	setUrl: function(url, noRedraw) {
		this._url = url;

		if (!noRedraw) {
			this.redraw();
		}

		return this;
	},

	_getSubdomain: L.TileLayer.prototype._getSubdomain,

	_isCurrentTile : function(coords, tileBounds) {

		if (!this._map) {
			return true;
		}

		var zoom = this._map._animatingZoom ? this._map._animateToZoom : this._map._zoom;
		var currentZoom = zoom === coords.z;

		var tileBounds = this._tileCoordsToBounds(coords);
		var currentBounds = this._map.getBounds().overlaps(tileBounds); 

		return currentZoom && currentBounds;

	},

	_getVectorTilePromise: function(coords, tileBounds) {
		var data = {
			s: this._getSubdomain(coords),
			x: coords.x,
			y: coords.y,
			z: coords.z
// 			z: this._getZoomForUrl()	/// TODO: Maybe replicate TileLayer's maxNativeZoom
		};
		if (this._map && !this._map.options.crs.infinite) {
			var invertedY = this._globalTileRange.max.y - coords.y;
			if (this.options.tms) { // Should this option be available in Leaflet.VectorGrid?
				data['y'] = invertedY;
			}
			data['-y'] = invertedY;
		}

		if (!this._isCurrentTile(coords, tileBounds)) {
			return Promise.resolve({layers:[]});
		}

		var tileUrl = L.Util.template(this._url, L.extend(data, this.options));

		return fetch(tileUrl, this.options.fetchOptions).then(function(response){

			if (!response.ok || !this._isCurrentTile(coords)) {
				return {layers:[]};
			} 

			return response.json();
	    }.bind(this)).then(function(json){

	      const geoJsonLayerName = "geojson";
	      const geoJsonExtent = 4096;
	      var tileLayers = {};
	      if (json) {
	        var vectorTileLayer = {
	          features: [],
	          extent: geoJsonExtent,
	          name: geoJsonLayerName,
	          length: json.features.length
	        }

	        for (var i in json.features) {
	          const feature_i = json.features[i];
	          // project coords to vector tile space
	          const point = projectPointToTileSpace(projectXfromEPSG900913(getGeometryX(feature_i)), projectYfromEPSG900913(getGeometryY(feature_i)), geoJsonExtent, projectZ(coords.z), coords.x, coords.y);
	          const feat = {
	            geometry: [point],
	            properties: feature_i.properties,
	            id: feature_i.id,
	            type: projectTypetoNumber(feature_i.geometry.type)
	          }
	          // console.log("transformd: " + JSON.stringify(json.features[i].properties));
	          vectorTileLayer.features.push(feat);
	        }
	        tileLayers[geoJsonLayerName] = vectorTileLayer;
	      }

	      var res = {layers: tileLayers, coords: coords};
	      // console.log('JSON' + JSON.stringify(res));

	      return res;
	    });
	}
});

function projectTypetoNumber(type) {
  if (type != 'Point') {
    throw "Other geomerty then Point is not supperted!";
  }
  return type === 'Polygon' || type === 'MultiPolygon' ? 3 : (type === 'LineString' || type === 'MultiLineString' ? 2 : 1)  // 1 = point, 2 = line, 3 = polygon
}

function getGeometryX(feat) {
  return feat.geometry.coordinates[0];
}

function getGeometryY(feat) {
  return feat.geometry.coordinates[1];
}

function projectXfromEPSG900913(x) {
    return x / 40075016.68 + 0.5;
};

function projectYfromEPSG900913(y) {
  return 1 - (y / 40075016.68 + 0.5);
};

function projectZ(z) {
  // return 2^z
  return 1 << z;
};

function getXYfromProperties(feat) {
  const re = /\[([0-9\.]+), ([0-9\.]+)\]/;
  const match = re.exec(feat.properties.coordinates);
  const x = match[1];
  const y = match[2];
  return [x, y];
}

function projectXfromEPSG4326(x) {
    return x / 360 + 0.5;
};

function projectYfromEPSG4326(y) {
    const sin = Math.sin(y * Math.PI / 180);
    const y2 = 0.5 - 0.25 * Math.log((1 + sin) / (1 - sin)) / Math.PI;
    return y2 < 0 ? 0 : y2 > 1 ? 1 : y2;
};

function projectPointToTileSpace(x, y, extent, z2, tx, ty) {
    return [
        Math.round(extent * (x * z2 - tx)),
        Math.round(extent * (y * z2 - ty))];
};

// 🍂factory L.vectorGrid.geojson(url: String, options)
// Instantiates a new geojson VectorGrid with the given URL template and options
L.vectorGrid.geojson = function (url, options) {
	return new L.VectorGrid.GeoJson(url, options);
};

