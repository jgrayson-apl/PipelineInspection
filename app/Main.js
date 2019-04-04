/*
  Copyright 2017 Esri

  Licensed under the Apache License, Version 2.0 (the "License");
  you may not use this file except in compliance with the License.
  You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

  Unless required by applicable law or agreed to in writing, software
  distributed under the License is distributed on an "AS IS" BASIS,
  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
  See the License for the specific language governing permissions and
  limitations under the License.​
*/

define([
  "calcite",
  "dojo/_base/declare",
  "ApplicationBase/ApplicationBase",
  "dojo/i18n!./nls/resources",
  "ApplicationBase/support/itemUtils",
  "ApplicationBase/support/domHelper",
  "dojo/_base/Color",
  "dojo/colors",
  "dojo/number",
  "dojo/date/locale",
  "dojo/on",
  "dojo/query",
  "dojo/dom",
  "dojo/dom-class",
  "dojo/dom-construct",
  "esri/identity/IdentityManager",
  "esri/core/Evented",
  "esri/core/watchUtils",
  "esri/core/promiseUtils",
  "esri/Viewpoint",
  "esri/portal/Portal",
  "esri/layers/Layer",
  "esri/layers/GraphicsLayer",
  "esri/geometry/Point",
  "esri/geometry/Extent",
  "esri/geometry/Polyline",
  "esri/geometry/geometryEngine",
  "esri/geometry/Mesh",
  "esri/geometry/support/geodesicUtils",
  "esri/Graphic",
  "esri/views/MapView",
  "esri/views/SceneView",
  "esri/widgets/Home",
  "esri/widgets/Search",
  "esri/widgets/LayerList",
  "esri/widgets/Legend",
  "esri/widgets/Expand",
  "Application/widgets/FlyTool"
], function (calcite, declare, ApplicationBase, i18n, itemUtils, domHelper,
             Color, colors, number, locale, on, query, dom, domClass, domConstruct,
             IdentityManager, Evented, watchUtils, promiseUtils, Viewpoint,
             Portal, Layer, GraphicsLayer,
             Point, Extent, Polyline, geometryEngine, Mesh, geodesicUtils,
             Graphic, MapView, SceneView,
             Home, Search, LayerList, Legend, Expand, FlyTool) {

  return declare([Evented], {

    /**
     *
     */
    constructor: function () {
      this.CSS = {
        loading: "configurable-application--loading"
      };
      this.base = null;

      // CALCITE WEB //
      calcite.init();
    },

    /**
     *
     * @param base
     */
    init: function (base) {
      if(!base) {
        console.error("ApplicationBase is not defined");
        return;
      }
      domHelper.setPageLocale(base.locale);
      domHelper.setPageDirection(base.direction);

      this.base = base;
      const config = base.config;
      const results = base.results;
      const find = config.find;
      const marker = config.marker;

      const allMapAndSceneItems = results.webMapItems.concat(results.webSceneItems);
      const validMapItems = allMapAndSceneItems.map(function (response) {
        return response.value;
      });

      const firstItem = validMapItems[0];
      if(!firstItem) {
        console.error("Could not load an item to display");
        return;
      }
      config.title = (config.title || itemUtils.getItemTitle(firstItem));
      domHelper.setPageTitle(config.title);

      const viewProperties = itemUtils.getConfigViewProperties(config);
      viewProperties.container = "view-container";
      viewProperties.constraints = { snapToZoom: false };

      const portalItem = this.base.results.applicationItem.value;
      const appProxies = (portalItem && portalItem.appProxies) ? portalItem.appProxies : null;

      itemUtils.createMapFromItem({ item: firstItem, appProxies: appProxies }).then((map) => {
        viewProperties.map = map;
        itemUtils.createView(viewProperties).then((view) => {
          itemUtils.findQuery(find, view).then(() => {
            itemUtils.goToMarker(marker, view).then(() => {
              this.viewReady(config, firstItem, view).then(() => {
                domClass.remove(document.body, this.CSS.loading);
              });
            });
          });
        });
      });
    },

    /**
     *
     * @param config
     * @param item
     * @param view
     */
    viewReady: function (config, item, view) {

      // TITLE //
      dom.byId("app-title-node").innerHTML = config.title;

      // USER SIGN IN //
      return this.initializeUserSignIn(view).always(() => {

        // MAP DETAILS //
        this.displayMapDetails(item);

        // HOME //
        const home = new Home({ view: view });
        view.ui.add(home, { position: "top-left", index: 0 });

        // LAYER LIST //
        this.initializeLayerList(view);

        // APPLICATION READY //
        this.applicationReady(view);

      });

    },

    /**
     *
     * @param view
     */
    initializeLayerList: function (view) {

      // CREATE OPACITY NODE //
      const createOpacityNode = (item, parent_node) => {
        const opacity_node = domConstruct.create("div", { className: "opacity-node esri-widget", title: "Layer Opacity" }, parent_node);
        // domConstruct.create("span", { className: "font-size--3", innerHTML: "Opacity:" }, opacity_node);
        const opacity_input = domConstruct.create("input", { className: "opacity-input", type: "range", min: 0, max: 1.0, value: item.layer.opacity, step: 0.01 }, opacity_node);
        on(opacity_input, "input", () => {
          item.layer.opacity = opacity_input.valueAsNumber;
        });
        item.layer.watch("opacity", (opacity) => {
          opacity_input.valueAsNumber = opacity;
        });
        opacity_input.valueAsNumber = item.layer.opacity;
        return opacity_node;
      };
      // CREATE TOOLS NODE //
      const createToolsNode = (item, parent_node) => {
        // TOOLS NODE //
        const tools_node = domConstruct.create("div", { className: "opacity-node esri-widget" }, parent_node);

        // REORDER //
        const reorder_node = domConstruct.create("div", { className: "inline-block" }, tools_node);
        const reorder_up_node = domConstruct.create("button", { className: "btn-link icon-ui-up", title: "Move layer up..." }, reorder_node);
        const reorder_down_node = domConstruct.create("button", { className: "btn-link icon-ui-down", title: "Move layer down..." }, reorder_node);
        on(reorder_up_node, "click", () => {
          view.map.reorder(item.layer, view.map.layers.indexOf(item.layer) + 1);
        });
        on(reorder_down_node, "click", () => {
          view.map.reorder(item.layer, view.map.layers.indexOf(item.layer) - 1);
        });

        // REMOVE LAYER //
        const remove_layer_node = domConstruct.create("button", { className: "btn-link icon-ui-close right", title: "Remove layer from map..." }, tools_node);
        on.once(remove_layer_node, "click", () => {
          view.map.remove(item.layer);
          this.emit("layer-removed", item.layer);
        });

        // ZOOM TO //
        const zoom_to_node = domConstruct.create("button", { className: "btn-link icon-ui-zoom-in-magnifying-glass right", title: "Zoom to Layer" }, tools_node);
        on(zoom_to_node, "click", () => {
          view.goTo(item.layer.fullExtent);
        });

        // LAYER DETAILS //
        const itemDetailsPageUrl = `${this.base.portal.url}/home/item.html?id=${item.layer.portalItem.id}`;
        domConstruct.create("a", { className: "btn-link icon-ui-description icon-ui-blue right", title: "View details...", target: "_blank", href: itemDetailsPageUrl }, tools_node);

        return tools_node;
      };
      // LAYER LIST //
      const layerList = new LayerList({
        container: "layer-list-container",
        view: view,
        listItemCreatedFunction: (evt) => {
          const item = evt.item;
          if(item.layer && item.layer.portalItem) {

            // CREATE ITEM PANEL //
            const panel_node = domConstruct.create("div", { className: "esri-widget" });

            // LAYER TOOLS //
            createToolsNode(item, panel_node);

            // OPACITY //
            createOpacityNode(item, panel_node);

            // if(item.layer.type === "imagery") {
            //   this.configureImageryLayer(view, item.layer, panel_node);
            // }

            // LEGEND //
            if(item.layer.legendEnabled) {
              const legend = new Legend({ container: panel_node, view: view, layerInfos: [{ layer: item.layer }] })
            }

            // SET ITEM PANEL //
            item.panel = {
              title: "Settings",
              className: "esri-icon-settings",
              content: panel_node
            };
          }
        }
      });

    },

    /**
     * DISPLAY MAP DETAILS
     *
     * @param portalItem
     */
    displayMapDetails: function (portalItem) {

      const portalUrl = this.base.portal ? (this.base.portal.urlKey ? `https://${this.base.portal.urlKey}.${this.base.portal.customBaseUrl}` : this.base.portal.url) : "https://www.arcgis.com";

      dom.byId("current-map-card-thumb").src = portalItem.thumbnailUrl;
      dom.byId("current-map-card-thumb").alt = portalItem.title;
      dom.byId("current-map-card-caption").innerHTML = `A map by ${portalItem.owner}`;
      dom.byId("current-map-card-caption").title = "Last modified on " + (new Date(portalItem.modified)).toLocaleString();
      dom.byId("current-map-card-title").innerHTML = portalItem.title;
      dom.byId("current-map-card-title").href = `${portalUrl}/home/item.html?id=${portalItem.id}`;
      dom.byId("current-map-card-description").innerHTML = portalItem.description;

    },

    /**
     *
     * @returns {*}
     */
    initializeUserSignIn: function (view) {

      const checkSignInStatus = () => {
        return IdentityManager.checkSignInStatus(this.base.portal.url).then(userSignIn);
      };
      IdentityManager.on("credential-create", checkSignInStatus);
      IdentityManager.on("credential-destroy", checkSignInStatus);

      // SIGN IN NODE //
      const signInNode = dom.byId("sign-in-node");
      const userNode = dom.byId("user-node");

      // UPDATE UI //
      const updateSignInUI = () => {
        if(this.base.portal.user) {
          dom.byId("user-firstname-node").innerHTML = this.base.portal.user.fullName.split(" ")[0];
          dom.byId("user-fullname-node").innerHTML = this.base.portal.user.fullName;
          dom.byId("username-node").innerHTML = this.base.portal.user.username;
          dom.byId("user-thumb-node").src = this.base.portal.user.thumbnailUrl;
          domClass.add(signInNode, "hide");
          domClass.remove(userNode, "hide");
        } else {
          domClass.remove(signInNode, "hide");
          domClass.add(userNode, "hide");
        }
        return promiseUtils.resolve();
      };

      // SIGN IN //
      const userSignIn = () => {
        this.base.portal = new Portal({ url: this.base.config.portalUrl, authMode: "immediate" });
        return this.base.portal.load().then(() => {
          this.emit("portal-user-change", {});
          return updateSignInUI();
        }).otherwise(console.warn);
      };

      // SIGN OUT //
      const userSignOut = () => {
        IdentityManager.destroyCredentials();
        this.base.portal = new Portal({});
        this.base.portal.load().then(() => {
          this.base.portal.user = null;
          this.emit("portal-user-change", {});
          return updateSignInUI();
        }).otherwise(console.warn);

      };

      // USER SIGN IN //
      on(signInNode, "click", userSignIn);

      // SIGN OUT NODE //
      const signOutNode = dom.byId("sign-out-node");
      if(signOutNode) {
        on(signOutNode, "click", userSignOut);
      }

      return checkSignInStatus();
    },

    /**
     *
     * @param view
     * @param layer_title
     * @param ready_callback
     * @returns {*}
     */
    whenLayerReady: function (view, layer_title, ready_callback) {

      const layer = view.map.layers.find(layer => {
        return (layer.title === layer_title);
      });
      if(layer) {
        return layer.load().then(() => {
          if(layer.visible) {
            return view.whenLayerView(layer).then((layerView) => {

              if(ready_callback) {
                ready_callback({ layer: layer, layerView: layerView });
              }

              if(layerView.updating) {
                return watchUtils.whenNotOnce(layerView, "updating").then(() => {
                  return { layer: layer, layerView: layerView };
                });
              } else {
                return watchUtils.whenOnce(layerView, "updating").then(() => {
                  return watchUtils.whenNotOnce(layerView, "updating").then(() => {
                    return { layer: layer, layerView: layerView };
                  });
                });
              }
            });
          } else {
            return promiseUtils.resolve({ layer: layer, layerView: null });
          }
        });
      } else {
        return promiseUtils.reject(new Error(`Can't find layer '${layer_title}'`));
      }

    },

    /**
     *
     * @param view
     */
    initializeFlyTool: function (view) {

      // FLY TOOL //
      const fly_tool = new FlyTool({ view: view });
      view.ui.add(fly_tool.button, { position: "top-right" });

    },

    /**
     * APPLICATION READY
     *
     * @param view
     */
    applicationReady: function (view) {

      this.initializeTour(view);

      const pipelineLayerName = "BP_Line";
      this.whenLayerReady(view, pipelineLayerName).then(layerInfo => {
        const pipelineLayer = layerInfo.layer;

        const query = pipelineLayer.createQuery();
        query.set({ outFields: null, returnZ: true });

        pipelineLayer.queryFeatures(query).then(pipelineFeatrureSet => {
          const pipelineFeature = pipelineFeatrureSet.features[0];

          //
          // WILL USING A CLIPPING AREA HELP IF WE SWITCHED TO A LOCAL SCENE?
          //
          //view.clippingArea = pipelineFeature.geometry.extent.clone();

          this.emit("pipeline-selected", { pipeline_geometry: pipelineFeature.geometry });
        });

        //
        // INTERACTIVELY SELECT PIPELINE //
        //
        /*view.on("click", click_evt => {
          view.hitTest(click_evt, { include: [pipelineLayer] }).then(hitResponse => {
            const pipelineHit = hitResponse.results.length ? hitResponse.results[0] : null;
            if(pipelineHit) {
              this.emit("pipeline-selected", { pipeline_geometry: pipelineHit.graphic.geometry });
            }
          });
        });*/

        this.initializeOverview(view);

      });

    },

    /**
     *
     * @param view
     */
    initializeOverview: function (view) {

      const overviewPanel = domConstruct.create("div", { className: "panel panel-blueX overview-panel" });
      view.ui.add(overviewPanel, "bottom-left");

      const overviewView = new MapView({
        container: overviewPanel,
        map: view.map,
        ui: { components: [] }
      });
      overviewView.when(() => {
        const locationGraphic = new Graphic({
          symbol: {
            type: "simple-marker",
            style: "circle",
            color: Color.named.dodgerblue,
            size: "9px",
            outline: { color: Color.named.dodgerblue, width: 3 }
          }
        });
        const locationLayer = new GraphicsLayer({ title: "Location Layer", graphics: [locationGraphic] });
        view.map.add(locationLayer);

        // DON'T DISPLAY IN 3D VIEW //
        view.whenLayerView(locationLayer).then(locationLayerView => {
          locationLayerView.visible = false;
        });

        // UPDATE GRAPHIC WHEN MAIN VIEW CAMERA CHANGES //
        watchUtils.init(view, "camera", camera => {
          locationGraphic.geometry = camera.position;
        });

        overviewView.on("click", click_evt => {
          overviewView.hitTest(click_evt).then(hitResponse => {
            const pipelineHit = hitResponse.results.find(result => {
              return (result.graphic && result.graphic.layer && (result.graphic.layer.title === "BP_Line"));
            });
            if(pipelineHit) {
              this.emit("find-nearest-along-pipeline", { location: click_evt.mapPoint });
            }
          });
        });

      });

    },

    /**
     *
     * @param view
     */
    initializeTour: function (view) {

      // SPIN TOOL //
      this.initializeViewSpinTools(view);

      // HEADING AND LOOK AROUND TOOLS //
      this.createHeadingSlider(view);

      // FLY TOOL //
      this.initializeFlyTool(view);

      //this.initializeSideViews(view);

      const max_clip_distance_input = dom.byId("max-clip-distance-input");
      const max_clip_distance_label = dom.byId("max-clip-distance-label");
      on(max_clip_distance_input, "input", () => {
        max_clip_distance_label.innerHTML = max_clip_distance_input.valueAsNumber;
      });
      on(max_clip_distance_input, "change", () => {
        view.constraints.clipDistance = { near: 0.1, far: max_clip_distance_input.valueAsNumber };
      });

      // NAVIGATION CONSTRAINTS //
      view.map.ground.navigationConstraint = { type: "none" };
      view.constraints.clipDistance = { near: 0.1, far: max_clip_distance_input.valueAsNumber };


      // ELEVATION SAMPLER //
      //const elevationSampler = tour_view.groundView.elevationSampler;
      // elevationSampler.on("changed", () => {
      // watchUtils.whenNotOnce(tour_view.groundView, "updating").then(() => {
      //   update_route_geom();
      // });
      // });


      const routeGraphic = new Graphic({
        symbol: {
          type: "line-3d",
          symbolLayers: [{
            type: "path",
            size: 1.0,
            material: { color: "yellow" }
          }]
        }
      });
      const routeLayer = new GraphicsLayer({
        title: "Route Layer",
        hasZ: true, hasM: true,
        graphics: [routeGraphic]
      });
      view.map.add(routeLayer);


      const tour_panel = dom.byId("tour-controls-panel");
      const tour_start_btn = dom.byId("tour-start-btn");
      const tour_prev_btn = dom.byId("tour-prev-btn");
      const tour_next_btn = dom.byId("tour-next-btn");
      const tour_play_btn = dom.byId("tour-play-btn");
      const tour_slider = dom.byId("tour-slider");

      let animation;

      let source_geom = null;
      let route_geom = null;
      let point_index = -1;
      let max_index = -1;


      const offset_input = dom.byId("offset-input");
      const offset_label = dom.byId("offset-label");
      on(offset_input, "input", () => {
        offset_label.innerHTML = offset_input.valueAsNumber.toFixed(1);
      });
      on(offset_input, "change", () => {
        set_route_geom(source_geom);
        set_current();
      });

      const densification_input = dom.byId("densification-input");
      const densification_label = dom.byId("densification-label");
      on(densification_input, "input", () => {
        densification_label.innerHTML = densification_input.valueAsNumber.toFixed(0);
      });
      on(densification_input, "change", () => {
        set_route_geom(source_geom);
        set_current();
      });

      const set_route_geom = (geometry) => {
        source_geom = geometry.clone();

        // SET ROUTE GEOM //
        route_geom = geometryEngine.simplify(geometry);

        if(!route_geom.hasM) {
          // CALC DISTANCE ALONG AS M //
          route_geom = this._setMAsDistanceAlong(route_geom);
        }
        // MODIFY THESE TWO METHODS AND PARAMETERS ACCORDING TO DATA //
        route_geom = geometryEngine.densify(route_geom, densification_input.valueAsNumber, "meters");
        route_geom = this.smoothGeometry(route_geom, 2, false, true);
        // OFFSET Z LAST //
        route_geom = this.offsetGeometryZ(route_geom, offset_input.valueAsNumber);

        //routeGraphic.geometry = route_geom;

        // DISTANCE / LENGTH //
        const total_length = geometryEngine.geodesicLength(route_geom, "kilometers");
        dom.byId("total-along-label").innerHTML = number.format((total_length), { places: 2 });

        // VALUE - POINT INDEX - MAX //
        tour_slider.valueAsNumber = point_index = 0;
        tour_slider.max = max_index = (route_geom.paths[0].length - 1);

      };

      const get_route_location = (index) => {
        return route_geom.getPoint(0, (index <= max_index) ? index : max_index);
      };


      this.on("find-nearest-along-pipeline", evt => {
        const nearestPointResult = geometryEngine.nearestCoordinate(route_geom, evt.location);
        point_index = nearestPointResult.vertexIndex;
        set_current();
      });


      const lookahead_input = dom.byId("lookahead-input");
      const lookahead_label = dom.byId("lookahead-label");
      on(lookahead_input, "input", () => {
        lookahead_label.innerHTML = lookahead_input.valueAsNumber.toFixed(0);
      });
      on(lookahead_input, "change", () => {
        set_current();
      });

      const lookdown_input = dom.byId("lookdown-input");
      const lookdown_label = dom.byId("lookdown-label");
      on(lookdown_input, "change", () => {
        lookdown_label.innerHTML = lookdown_input.valueAsNumber.toFixed(0);
      });
      on(lookdown_input, "change", () => {
        set_current();
      });


      let ahead_location = null;

      // WHEN INTERACTION STOPS, SET VIEW TARGET //
      // - MAYBE HELPS USER INTERACTION?
      watchUtils.whenFalse(view, "interacting", () => {
        if(ahead_location) {
          view.viewpoint = new Viewpoint({
            camera: view.camera,
            targetGeometry: ahead_location
          });
        }
      });

      view.on("pointer-move", pointer_evt => {
        view.hitTest(pointer_evt).then(hitResponse => {
          if(hitResponse.results.length === 0) {
            pointer_evt.preventDefault();
            pointer_evt.stopPropagation();
          }
        });
      });

      const aoiGraphic = new Graphic({
        symbol: {
          type: "mesh-3d",
          symbolLayers: [
            {
              type: "fill",
              material: { color: Color.named.dodgerblue.concat(0.01), doubleSided: false },
              edges: {
                type: "solid",
                color: Color.named.white,
                size: 1.0
              }
            }
          ]
        }
      });
      const aoiLayer = new GraphicsLayer({ title: "Area of Interest", graphics: [aoiGraphic] });
      view.map.add(aoiLayer);


      const toRadians = (Math.PI / 180.0);

      const set_current = () => {

        // SLIDER VALUE //
        tour_slider.valueAsNumber = point_index;

        // CURRENT POSITION //
        const position = get_route_location(point_index);
        this.emit("animate-update", { position: position });

        dom.byId("current-along-label").innerHTML = number.format((position.m / 1000.0), { places: 2 });

        // LOOK AHEAD LOCATION //
        let ahead_distance = (position.m + lookahead_input.valueAsNumber);
        let ahead_index = point_index;

        do {
          ahead_location = get_route_location(++ahead_index);
        } while ((ahead_location && (ahead_location.m <= ahead_distance)) && (ahead_index < max_index));

        // CALC LOOK AHEAD AZIMUTH USING GEODESIC CALCULATIONS //
        const geodesicInfo = geodesicUtils.inverseGeodeticSolver(
            position.latitude * toRadians,
            position.longitude * toRadians,
            ahead_location.latitude * toRadians,
            ahead_location.longitude * toRadians
        );

        // CREATE NEW CAMERA FOR CURRENT POSITION //
        const _camera = view.camera.clone();
        _camera.position = position;
        _camera.heading = (geodesicInfo.azimuth / toRadians);
        _camera.tilt = lookdown_input.valueAsNumber;

        // SET NEW CAMERA //
        view.camera = _camera;

        //aoiGraphic.geometry = Mesh.createSphere(position, { size: 200, densificationFactor: 2 }).centerAt(position);

        //this.emit("view-set", { lookahead: ahead_location, offset: offset_input.valueAsNumber });
      };

      const getFPS = () => {
        return dom.byId("speed-input").checked ? 9 : 3;
      };

      function animate(start_index) {

        let animating = true;
        //let frame_handle = null;
        point_index = start_index;

        const _frame = function () {
          if(!animating) {
            return;
          }

          const at_end = (++point_index >= max_index);
          if(at_end) {
            point_index = 0;
          }
          set_current();

          setTimeout(() => {
            requestAnimationFrame(_frame);
          }, at_end ? 1500 : (1000 / getFPS()));

        };

        // INITIATE ANIMATION //
        //frame_handle = scheduling.addFrameTask({ update: _frame });
        _frame();

        return {
          remove: function () {
            animating = false;
            /*if(frame_handle) {
              frame_handle.remove();
              frame_handle = null;
            }*/
          }
        };
      }

      const startAnimation = () => {
        stopAnimation();
        this.emit("stop-route-editing", {});
        domClass.toggle(tour_play_btn, "icon-ui-play icon-ui-pause");
        animation = animate(point_index);
      };

      const stopAnimation = () => {
        if(animation) {
          animation.remove();
          animation = null;
          domClass.toggle(tour_play_btn, "icon-ui-play icon-ui-pause");
        }
      };

      this.on("pipeline-selected", evt => {
        if(evt.pipeline_geometry) {

          stopAnimation();
          set_route_geom(evt.pipeline_geometry);
          set_current();

          domClass.remove(tour_panel, "btn-disabled");
        } else {
          domClass.add(tour_panel, "btn-disabled");
        }
      });


      on(tour_slider, "input", () => {
        point_index = tour_slider.valueAsNumber;
        set_current();
      });

      on(tour_play_btn, "click", () => {
        if(animation) {
          stopAnimation();
        } else {
          startAnimation();
        }
      });

      on(tour_start_btn, "click", () => {
        point_index = 0;
        set_current();
      });

      on(tour_prev_btn, "click", () => {
        point_index--;
        set_current();
      });

      on(tour_next_btn, "click", () => {
        point_index++;
        set_current();
      });


    },

    /**
     *
     * @param polyline
     * @returns polyline
     */
    _setMAsDistanceAlong: function (polyline) {
      let distanceAlong = 0.0;
      return new Polyline({
        hasZ: true, hasM: true,
        spatialReference: polyline.spatialReference,
        paths: polyline.paths.map((part, partIdx) => {
          return part.map((coords, coordIdx) => {
            const location = polyline.getPoint(partIdx, coordIdx);
            const prevLocation = polyline.getPoint(partIdx, (coordIdx > 0) ? (coordIdx - 1) : 0);
            distanceAlong += geometryEngine.distance(prevLocation, location, "meters");
            return [coords[0], coords[1], coords[2] || 0.0, distanceAlong];
          });
        })
      });
    },

    /**
     *
     * @param geometry
     * @param offsetZ
     * @returns {*}
     */
    offsetGeometryZ: function (geometry, offsetZ) {

      let hasM = geometry.hasM;
      let mCoordIndex = (geometry.hasZ ? 3 : 2);
      let parts = (geometry.rings || geometry.paths);

      let partsWithZs = parts.map(part => {
        return part.map(coord => {
          const coordsWithZs = [coord[0], coord[1], (coord[2] + offsetZ)];
          if(hasM) {
            coordsWithZs.push(coord[mCoordIndex]);
          }
          return coordsWithZs;
        });
      });

      let geometryWithZs = geometry.clone();
      geometryWithZs.hasZ = true;
      geometryWithZs[geometryWithZs.paths ? "paths" : "rings"] = partsWithZs;

      return geometryWithZs;
    },

    /**
     * Adapted from: https://github.com/stbaer/smooth-path/blob/master/index.js
     *               http://www.idav.ucdavis.edu/education/CAGDNotes/Chaikins-Algorithm/Chaikins-Algorithm.html
     *
     * @param geometry Polyline | Polygon
     * @param iterationsCount Number
     * @param smoothZs Boolean
     * @param smoothMs Boolean
     * @returns Polyline | Polygon
     */
    smoothGeometry: function (geometry, iterationsCount, smoothZs, smoothMs) {

      let offsetFactor = 0.25;
      let iterations = iterationsCount || 6;

      let smoothGeometry = geometry.clone();
      let geometryParts = (smoothGeometry.rings || smoothGeometry.paths);
      if(geometryParts) {

        let smoothParts = [];
        let smoothPart;
        let part;
        let p0x, p0y, p0z, p0m, p1x, p1y, p1z, p1m;

        for (let partIndex = 0; partIndex < geometryParts.length; partIndex++) {
          part = geometryParts[partIndex];
          for (let iteration = 0; iteration < iterations; iteration++) {
            smoothPart = [];
            for (let coordIndex = 0; coordIndex < (part.length - 1); coordIndex++) {

              p0x = part[coordIndex][0];
              p0y = part[coordIndex][1];
              p1x = part[coordIndex + 1][0];
              p1y = part[coordIndex + 1][1];

              smoothPart[coordIndex] = [
                ((1.0 - offsetFactor) * p0x + offsetFactor * p1x),
                ((1.0 - offsetFactor) * p0y + offsetFactor * p1y)
              ];
              smoothPart[coordIndex + 1] = [
                (offsetFactor * p0x + (1.0 - offsetFactor) * p1x),
                (offsetFactor * p0y + (1.0 - offsetFactor) * p1y)
              ];

              if(smoothZs && smoothGeometry.hasZ) {
                p0z = part[coordIndex][2] || 0.0;
                p1z = part[coordIndex + 1][2] || 0.0;
                smoothPart[coordIndex].push(((1.0 - offsetFactor) * p0z + offsetFactor * p1z));
                smoothPart[coordIndex + 1].push((offsetFactor * p0z + (1.0 - offsetFactor) * p1z));
              } else {
                smoothPart[coordIndex].push(part[coordIndex][2] || 0.0);
                smoothPart[coordIndex + 1].push(part[coordIndex + 1][2] || 0.0);
              }

              if(smoothMs && smoothGeometry.hasM) {
                p0m = part[coordIndex][3] || 0.0;
                p1m = part[coordIndex + 1][3] || 0.0;
                smoothPart[coordIndex].push(((1.0 - offsetFactor) * p0m + offsetFactor * p1m));
                smoothPart[coordIndex + 1].push((offsetFactor * p0m + (1.0 - offsetFactor) * p1m));
              } else {
                smoothPart[coordIndex].push(part[coordIndex][3] || 0.0);
                smoothPart[coordIndex + 1].push(part[coordIndex + 1][3] || 0.0);
              }

            }
            part = smoothPart;
          }
          smoothParts.push(smoothPart);
        }
        smoothGeometry[smoothGeometry.paths ? "paths" : "rings"] = smoothParts;
      } else {
        console.warn("smoothGeometry() only works with Polyline and Polygon geometry types; input geometry type: ", geometry.type);
      }

      return smoothGeometry;
    },

    /**
     *
     * @param view
     */
    initializeSideViews: function (view) {

      const createSideView = (container) => {
        return new SceneView({
          container: container,
          map: view.map,
          ui: { components: [] },
          constraints: { clipDistance: { near: 0.5, far: 50000 } }
        });
      };

      const left_panel = domConstruct.create("div", { className: "panel side-view" });
      view.ui.add(left_panel, "bottom-left");
      const left_view = createSideView(left_panel);

      const right_panel = domConstruct.create("div", { className: "panel side-view" });
      view.ui.add(right_panel, "bottom-right");
      const right_view = createSideView(right_panel);

      this.on("view-set", (evt) => {

        const target = evt.lookahead.clone();
        target.z -= evt.offset;

        // ...UGLY... FIND A BETTER WAY TO DO THIS... //
        const left_rotated = geometryEngine.rotate(view.camera.position, -90, target);
        const left_position = this._interpolateLocation(view, target, left_rotated, 0.1);
        const right_rotated = geometryEngine.rotate(view.camera.position, 90, target);
        const right_position = this._interpolateLocation(view, target, right_rotated, 0.1);
        // right_position.z = left_position.z = target.z;
        left_view.goTo({ position: left_position, center: target }, { animate: false });
        right_view.goTo({ position: right_position, center: target }, { animate: false });

      });

    },

    /**
     *
     * @param view
     * @param fromPnt
     * @param toPnt
     * @param along
     * @returns {*}
     * @private
     */
    _interpolateLocation: function (view, fromPnt, toPnt, along) {
      return new Point({
        spatialReference: view.spatialReference,
        hasZ: true,
        x: fromPnt.x + ((toPnt.x - fromPnt.x) * along),
        y: fromPnt.y + ((toPnt.y - fromPnt.y) * along),
        z: fromPnt.z + ((toPnt.z - fromPnt.z) * along)
      });
    },

    /**
     *
     * @param view
     */
    createHeadingSlider: function (view) {

      const set_camera_heading = (heading, animate) => {
        const camera = view.camera.clone();
        camera.heading = heading;
        view.goTo(camera, { animate: false });
      };

      const headingPanel = domConstruct.create("div", { className: "panel panel-dark-blue padding-trailer-quarter" });
      view.ui.add(headingPanel, "top-right");

      const directionsTable = domConstruct.create("table", { className: "slider-table trailer-0" }, headingPanel);
      const directionsRow = domConstruct.create("tr", {}, directionsTable);
      domConstruct.create("td", {}, directionsRow);
      const directionsNode = domConstruct.create("div", { className: "directions-node text-center" }, domConstruct.create("td", {}, directionsRow));
      domConstruct.create("td", {}, directionsRow);

      const directions = [
        { label: "N", tooltip: "North", heading: 0.0 },
        { label: "ne", tooltip: "North East", heading: 45.0 },
        { label: "E", tooltip: "East", heading: 90.0 },
        { label: "se", tooltip: "South East", heading: 135.0 },
        { label: "S", tooltip: "South", heading: 180.0 },
        { label: "sw", tooltip: "South West", heading: 225.0 },
        { label: "W", tooltip: "West", heading: 270.0 },
        { label: "nw", tooltip: "North West", heading: 315.0 },
        { label: "N", tooltip: "North", heading: 360.0 }
      ];
      directions.forEach(dirInfo => {
        const dirNode = domConstruct.create("span", {
          className: "direction-node inline-block text-center font-size--3 avenir-demi esri-interactive",
          innerHTML: dirInfo.label,
          title: dirInfo.tooltip
        }, directionsNode);
        on(dirNode, "click", () => {
          set_camera_heading(dirInfo.heading);
        });
      });

      const sliderRow = domConstruct.create("tr", {}, directionsTable);
      const sliderLeftNode = domConstruct.create("span", {
        title: "decrease/left/counter-clockwise",
        className: "direction-node esri-interactive icon-ui-left icon-ui-flush font-size-1"
      }, domConstruct.create("td", {}, sliderRow));
      const slider = domConstruct.create("input", {
        className: "font-size-1",
        type: "range",
        min: 0, max: 360, step: 1, value: 0
      }, domConstruct.create("td", {}, sliderRow));
      const sliderRightNode = domConstruct.create("span", {
        title: "increase/right/clockwise",
        className: "direction-node esri-interactive icon-ui-right icon-ui-flush font-size-1"
      }, domConstruct.create("td", {}, sliderRow));

      on(sliderLeftNode, "click", () => {
        set_camera_heading(slider.valueAsNumber - 5);
      });
      on(sliderRightNode, "click", () => {
        set_camera_heading(slider.valueAsNumber + 5);
      });

      const headingRow = domConstruct.create("tr", {}, directionsTable);
      domConstruct.create("td", {}, headingRow);
      const heading_label = domConstruct.create("div", { className: "direction-label text-center font-size-1 avenir-bold", innerHTML: "0&deg;" }, domConstruct.create("td", {}, headingRow));
      domConstruct.create("td", {}, headingRow);

      on(slider, "input", () => {
        set_camera_heading(slider.valueAsNumber);
      });
      watchUtils.init(view, "camera.heading", (heading) => {
        if(heading) {
          heading_label.innerHTML = `${heading.toFixed(0)}&deg;`;
          slider.valueAsNumber = heading;
        }
      });

      // LOOK AROUND NAVIGATION //
      this.initializeLookAroundNavigation(view, headingPanel);

    },

    /**
     *
     * @param view
     * @param panel
     */
    initializeLookAroundNavigation: function (view, panel) {

      const look_around_handlers = [];

      const clear_look_around_handlers = () => {
        if(look_around_handlers.length > 0) {
          look_around_handlers.forEach(handler => {
            handler.remove();
            handler = null;
          });
          look_around_handlers.length = 0;
        }
      };

      const stop_propagation = evt => evt.stopPropagation();

      const create_look_around_handlers = () => {

        look_around_handlers.push(view.on("pointer-enter", function (evt) {
          view.container.style.cursor = "all-scroll";
          evt.stopPropagation();
        }));

        // B + Left-click + Drag //
        look_around_handlers.push(view.on("drag", ["b"], function (evt) {
          if(evt.button !== 0) {
            evt.stopPropagation();
          }
        }));

        look_around_handlers.push(view.on("immediate-click", stop_propagation));
        look_around_handlers.push(view.on("click", stop_propagation));
        look_around_handlers.push(view.on("double-click", stop_propagation));
        look_around_handlers.push(view.on("hold", stop_propagation));
        look_around_handlers.push(view.on("key-down", stop_propagation));
        look_around_handlers.push(view.on("key-up", stop_propagation));
        look_around_handlers.push(view.on("mouse-wheel", stop_propagation));
        look_around_handlers.push(view.on("pointer-down", stop_propagation));
        look_around_handlers.push(view.on("pointer-move", stop_propagation));
        look_around_handlers.push(view.on("pointer-up", stop_propagation));

        look_around_handlers.push(view.on("pointer-leave", function (evt) {
          view.container.style.cursor = "default";
          evt.stopPropagation();
        }));
      };

      // LOOK AROUND BUTTON //
      const look_around_btn = domConstruct.create("button", { className: "btn btn-fill", innerHTML: "Look Around" }, panel);
      on(look_around_btn, "click", () => {
        domClass.toggle(look_around_btn, "icon-ui-check-mark");
        const is_enabled = domClass.contains(look_around_btn, "icon-ui-check-mark");
        if(!is_enabled) {
          clear_look_around_handlers();
          view.inputManager._inputManager._activeKeyModifiers = new Set([]);
        } else {
          view.inputManager._inputManager._activeKeyModifiers = new Set(["b"]);
          create_look_around_handlers();
        }
      });

    },

    /**
     *
     * @param view
     */
    initializeViewSpinTools: function (view) {

      let spin_direction = "none";
      let spin_handle = null;
      let spin_step = 0.1;
      const spin_fps = 90;

      const _spin = () => {
        if(spin_direction !== "none") {
          const heading = (view.camera.heading + ((spin_direction === "right") ? spin_step : -spin_step));
          spin_handle = view.goTo({ target: view.viewpoint.targetGeometry, heading: heading }, { animate: false }).then(() => {
            if(spin_direction !== "none") {
              setTimeout(() => {
                requestAnimationFrame(_spin);
              }, 1000 / spin_fps);
            }
          });
        }
      };

      const enableSpin = (direction) => {
        spin_direction = direction;
        if(spin_direction !== "none") {
          requestAnimationFrame(_spin);
        } else {
          spin_handle && !spin_handle.isFulfilled() && spin_handle.cancel();
        }
      };

      let previous_direction = "none";
      this.spin_pause = () => {
        previous_direction = spin_direction;
        enableSpin("none");
      };
      this.spin_resume = () => {
        enableSpin(previous_direction);
      };

      const viewSpinNode = domConstruct.create("div", { className: "view-spin-node" }, view.root);
      const spinLeftBtn = domConstruct.create("span", { className: "spin-btn icon-ui-arrow-left-circled icon-ui-flush font-size-2 esri-interactive", title: "Spin Left" }, viewSpinNode);
      const alwaysUpBtn = domConstruct.create("span", { id: "always-up-btn", className: "spin-btn icon-ui-compass icon-ui-flush font-size--1 esri-interactive", title: "Always Up" }, viewSpinNode);
      const spinRightBtn = domConstruct.create("span", { className: "spin-btn icon-ui-arrow-right-circled icon-ui-flush font-size-2 esri-interactive", title: "Spin Right" }, viewSpinNode);

      // SPIN LEFT //
      on(spinLeftBtn, "click", () => {
        enableSpin("none");
        domClass.remove(spinRightBtn, "selected");
        domClass.toggle(spinLeftBtn, "selected");
        if(domClass.contains(spinLeftBtn, "selected")) {
          enableSpin("left");
        }
      });

      // SPIN RIGHT //
      on(spinRightBtn, "click", () => {
        enableSpin("none");
        domClass.remove(spinLeftBtn, "selected");
        domClass.toggle(spinRightBtn, "selected");
        if(domClass.contains(spinRightBtn, "selected")) {
          enableSpin("right");
        }
      });

      // ALWAYS UP //
      let always_up = false;
      on(alwaysUpBtn, "click", () => {
        domClass.toggle(alwaysUpBtn, "selected");
        always_up = domClass.contains(alwaysUpBtn, "selected");
      });
    }

  });
});