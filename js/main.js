$(document).ready(function(){

    
    
    // add accordian expand on click action
    var acc = document.getElementsByClassName("accordion");
    var i;

    for (i = 0; i < acc.length; i++) {
      acc[i].addEventListener("click", function() {
        this.classList.toggle("active");
        var panel = this.nextElementSibling;
        if (panel.style.maxHeight){
          panel.style.maxHeight = null;
        } else {
          panel.style.maxHeight = panel.scrollHeight + "px";
        } 
      });
    }
    
    $('.dropDown').change(function() {
        var change = this.value;
        console.log(change);
        $(this).css('color','black');
    });
   
    var mistakes = [];
   
    $("input").change(function(){
        if(!this.checkValidity()){
            if (mistakes.includes(this.id)){
                //do nothing
            } else{
                mistakes.push(this.id);
            }
        } else {
            var index = mistakes.indexOf(this.id);
            if (index !== -1){mistakes.splice(index,1);}
        }
        mistakeCheck(mistakes)
    });
    
    function mistakeCheck(mistakes){
        console.log(mistakes);
        if(mistakes.length > 0){
            document.getElementById("btnUpdate").disabled = true;
            document.getElementById("btnUpdate").value = "Correct entry mistakes to submit";
        } else {
            document.getElementById("btnUpdate").disabled = false;
            document.getElementById("btnUpdate").value = 'Submit Property Update';
        }
    };
    
    /*
    for (item in fieldList){
            var name = fieldList[item];
            var element = dom.byId(name);
            $(element).change(function(){
                if(!element.checkValidity()){
                    console.log(element.validationMessage);
                } else {
                    console.log("im ok!")
                }
            });
        };
    */
    
    require([
        "esri/Map",
        "esri/views/MapView",
        "esri/layers/MapImageLayer",
        "esri/layers/Layer",
        "esri/layers/support/Field",
        "esri/widgets/LayerList",
        "esri/Graphic",
        "esri/widgets/Expand",
        "esri/widgets/BasemapToggle",
        "esri/widgets/Home",
        "esri/geometry/Extent",
        "esri/Viewpoint",
        "esri/core/watchUtils",
        "dojo/on",
        "dojo/dom",
        "dojo/domReady!"
      ],
      function(
        Map, MapView, MapImageLayer, Layer, Field, LayerList, Graphic, Expand, BasemapToggle,
        Home, Extent, Viewpoint, watchUtils,
        on, dom
      ) {

        var featureLayer, layerExpand, editExpand;

        // feature edit area domNodes
        var editArea, attributeEditing, updateInstructionDiv;
        
                              
        var fieldList = [];
        var intFields = [];
        var floatFields = [];
        
        
        // parse through data to fill in drop downs and collect field names for comparison
        $.ajax({
            method: "GET",
            url: "https://devmaps.vedp.org/arcgis/rest/services/aks_fp/aks_fp_servicelayers/FeatureServer/0",
            data: {
                f: "pjson"
            }
        }).done(function(data) {
            var layerdata = JSON.parse(data);
            var fields = layerdata.fields;
            $.each(fields, function(index, value) {
                fieldList.push(value.name);
                if (value.type == "esriFieldTypeSmallInteger" || value.type == "esriFieldTypeInteger"){
                    intFields.push(value.name);
                } else if (value.type == "esriFieldTypeDouble"){
                    floatFields.push(value.name);
                };
                if(value.domain) {
                    var element = $('select[id="' + value.name + '"]');
                    createOption(value.domain, element);
                } 
            });
        });

        
        // create option function
        function createOption(domain, element) {
            $.each(domain.codedValues, function(domainIndex, domainValue) {
                var option = '<option value="' + domainValue.code + '">' + domainValue.name + '</option>';
                element.append(option);
            });
        }
        
        
        var map = new Map({
          basemap: "streets"
        });

        // initial extent of the view and home button
        var initialExtent = new Extent({
          xmin: -9639000,
          xmax: -7898000,
          ymin: 4177000,
          ymax: 4915000,
          spatialReference: 102100
        }); 
        
        // style for enterprise zones
        var ezRenderer={
            type: "simple",
            symbol: {
                type: "simple-fill",
                color: "#68527F",
                style: "solid",
                outline: {
                    width: 0.5,
                    color: "#542B7F"
                }
            },  
        };
        
        // style for technology zones
        var tzRenderer={
            type: "simple",
            symbol: {
                type: "simple-fill",
                color: "#46787F",
                style: "solid",
                outline: {
                    width: 0.5,
                    color: "#20737F"
                }
            },  
        };
        
        var propRenderer= {
            type: "simple",
            symbol:{
                type:"simple-marker",
                outline: {
                    color: [168, 0, 0, 1]
                },
                size: 8,
                color: [168, 0, 0, 0.52]
            }
        };
        
        
        // map instance
        var view = new MapView({
          container: "viewDiv",
          map: map,
          extent: initialExtent,
          constraints:{
              rotationEnabled: false
          }
        });

        // add map image layer from service from service
        var incentives = new MapImageLayer({
            url: "https://maps.yesvirginia.org/arcgis/rest/services/OpenData/OpenDataLayers/MapServer/",
            title: "Incentive Zone Boundaries",
            sublayers: [
                {
                    id: 3,
                    visible: false,
                    renderer: ezRenderer,
                    opacity: 0.4,
                    title: "Virginia Enterprise Zones"
                },{
                    id:5,
                    visible: false,
                    renderer: tzRenderer,
                    opacity: 0.4,
                    title: "Technology Zones"
                }
            ]
        });
        map.add(incentives);  // adds the layer to the map

        
        // add an editable featurelayer rest end point
        Layer.fromArcGISServerUrl({
            url: "https://devmaps.vedp.org/arcgis/rest/services/aks_fp/aks_fp_servicelayers/FeatureServer/0",
            properties: {
                title: "Virginia Properties",
                renderer: propRenderer
                //outFields: ["*"]
                // set any layer properties here (popups)
            }
          }).then(addLayer)
          .catch(handleLayerLoadError);
        
        
        setupEditing(fieldList, intFields, floatFields);
        setupView();

        function addLayer(lyr) {
            featureLayer = lyr;
            map.add(lyr);
        }  
         
        

        function applyEdits(params) {
          unselectFeature();
          var promise = featureLayer.applyEdits(params);
          editResultsHandler(promise);
        }

        

        // *****************************************************
        // applyEdits promise resolved successfully
        // query the newly created feature from the featurelayer
        // set the editFeature object so that it can be used
        // to update its features.
        // *****************************************************
        function editResultsHandler(promise) {
          promise
            .then(function(editsResult) {
              var extractObjectId = function(result) {
                return result.objectId;
              };

              // get the objectId of the newly added feature
              if (editsResult.addFeatureResults.length > 0) {
                var adds = editsResult.addFeatureResults.map(
                  extractObjectId);
                newIncidentId = adds[0];

                selectFeature(newIncidentId);
              }
            })
            .catch(function(error) {
              console.log("===============================================");
              console.error("[ applyEdits ] FAILURE: ", error.code, error.name,
                error.message);
              console.log("error = ", error);
            });
        }

        // *****************************************************
        // listen to click event on the view
        // 1. select if there is an intersecting feature
        // 2. set the instance of editFeature
        // 3. editFeature is the feature to update or delete
        // *****************************************************
        view.on("click", function(evt) {
          unselectFeature();
          view.hitTest(evt).then(function(response) {
            if (response.results.length > 0 && response.results[0].graphic) {

                var feature = response.results[0].graphic;
                selectFeature(feature.attributes[featureLayer.objectIdField]);

                //Name.value = feature.attributes["Name"];
                //Address.value = feature.attributes["Address"];
            
                
                for (item in fieldList){
                    var name = fieldList[item];
                    var value = feature.attributes[name];
                    var element  = document.getElementById(name);
                    if (name =="OBJECTID"){
                        // do nothing
                    } else if (name== "AvailableDate" && value != null){                    
                        var d = new Date(value).toISOString().split('T')[0]; // format date for appropriate entry
                        element.value = d;
                    } else if (value == null){
                        element.value ='';
                    } else {
                        element.value = value;
                    }
                }
                
                
                
                attributeEditing.style.display = "block";
                updateInstructionDiv.style.display = "none";
            }
          });
        });


        // *****************************************************
        // select Feature function
        // 1. Select the newly created feature on the view
        // 2. or select an existing feature when user click on it
        // 3. Symbolize the feature with cyan rectangle
        // *****************************************************
        function selectFeature(objectId) {
          // symbol for the selected feature on the view
          var selectionSymbol = {
            type: "simple-marker", // autocasts as new SimpleMarkerSymbol()
            color: [0, 0, 0, 0],
            size: 10,
            outline: {
              color: [0, 255, 255, 1],
              width: "3px"
            }
          };
          var query = featureLayer.createQuery();
          query.where = featureLayer.objectIdField + " = " + objectId;

          featureLayer.queryFeatures(query).then(function(results) {
            if (results.features.length > 0) {
              editFeature = results.features[0];
              editFeature.symbol = selectionSymbol;
              view.graphics.add(editFeature);
            }
          });
        }

        // *****************************************************
        // hide attributes update and delete part when necessary
        // *****************************************************
        function unselectFeature() {
          attributeEditing.style.display = "none";
          updateInstructionDiv.style.display = "block";
          
            
          for (item in fieldList){
              var name = fieldList[item];
              var element  = document.getElementById(name);
              
              if (name =="OBJECTID"){
                    // do nothing;
                } else {
                    element.value = null;
                }
            }
          //Name.value = null;
          //Address.value = null;
          view.graphics.removeAll();
        }

        // *****************************************************
        // add homeButton and expand widgets to UI
        // *****************************************************
        function setupView() {
          // set home button view point to initial extent
            var homeButton = new Home({
                view: view,
                viewpoint: new Viewpoint({
                    targetGeometry: initialExtent
                })
            });
            view.ui.add(homeButton, "top-left");

            var layerList = new LayerList({
                view: view,
                listItemCreatedFunction: function(event){
                    var item = event.item;
                    
                    if (item.title === "Incentive Zone Boundaries"){
                        item.open = true;
                        item.children.items["0"].panel = {
                            content: document.getElementById("tzLegend"),
                            open: true
                        }
                        item.children.items["1"].panel = {
                            content: document.getElementById("ezLegend"),
                            open: true
                        }
                    }
                }
            });
            
            var query = document.getElementById("info-div");
            
            // 1 - Create the widget
            var toggle = new BasemapToggle({
                // 2 - Set properties
                view: view, // view that provides access to the map's 'topo' basemap
                nextBasemap: "hybrid" // allows for toggling to the 'hybrid' basemap
            });

            // Add widget to the top right corner of the view
            view.ui.add(toggle, "bottom-left");
            //view.ui.add("info-div", "bottom-left")
            
            // expand layer list
            layerExpand = new Expand({
                expandIconClass: "esri-icon-layers",
                expandTooltip: "Open Layer List",
                expanded: false,
                view: view,
                content: layerList
                });

            // expand widget
            editExpand = new Expand({
                expandIconClass: "esri-icon-edit",
                expandTooltip: "Expand Edit",
                expanded: true,
                view: view,
                content: editArea
            });
            
            queryExpand = new Expand ({
                expandIconClass: "esri-icon-filter",
                expandTooltip: "Expand Property Filter",
                expanded: false,
                view: view,
                content: query
            });

            // add edit and layer list   
            view.ui.add( editExpand, "top-right");
            view.ui.add([layerExpand, queryExpand],"top-left");
        }
        
        // on filter change action
         $('#filter').change(function(){
            var selected = this.value;
            if (selected == ''){
                featureLayer.definitionExpression = "";
            } else{
             featureLayer.definitionExpression = "PropertyType = '" + selected + "'";
            }

        });
        
        // ez tz click from edit panel
        $('#ezCheck').click(function(){
            var visibility = incentives.sublayers.items["0"].visible
            if (visibility == true){
                incentives.sublayers.items["0"].visible = false;
            } else {
                incentives.sublayers.items["0"].visible = true;
            }
        });
        $('#tzCheck').click(function(){
            var visibility = incentives.sublayers.items["1"].visible
            if (visibility == true){
                incentives.sublayers.items["1"].visible = false;
            } else {
                incentives.sublayers.items["1"].visible = true;
            }
        });
        
        
        $('#attributeArea input', '#attributeArea select').each(function(){
            $(this).change(function(){
                console.log("i changed")
            })
        })
        
        
        

        // *****************************************************
        // set up for editing
        // *****************************************************
        function setupEditing(fieldList, intFields, floatFields) {
          // input boxes for the attribute editing
          editArea = dom.byId("editArea");
          updateInstructionDiv = dom.byId("updateInstructionDiv");
          attributeEditing = dom.byId("featureUpdateDiv");        
           /*
          for (item in fieldList){
            var name = fieldList[item];
            var element  = dom.byId(name);
            if (name =="OBJECTID"){
                // do nothing
            } else {
                name = element;
                console.log("done56");
                }
            }  
            */    
          //Name = dom.byId("Name");
          //Address = dom.byId("Address");

          // *****************************************************
          // btnUpdate click event
          // update attributes of selected feature
          // *****************************************************
          on(dom.byId("btnUpdate"), "click", function(evt) {
              featureLayer.definitionExpression = ""
              if (editFeature) {
              
                for (item in fieldList){
                    var name = fieldList[item];
                    var value = editFeature.attributes[name];
                    var element  = document.getElementById(name);
                   // var elementVal = element.value;
                    if (name =="OBJECTID"){
                        // do nothing
                    } else if (element.value == ""){
                        editFeature.attributes[name]= null;
                    } else if (intFields.includes(name)){
                        editFeature.attributes[name]= parseInt(element.value);
                    } else if (floatFields.includes(name)){
                        editFeature.attributes[name]= parseFloat(element.value);
                    }else {
                        editFeature.attributes[name]= element.value;
                    }
                }
                
                
              //editFeature.attributes["Name"] = Name.value;
              //editFeature.attributes["Address"] = Address.value;
              var edits = {
                  updateFeatures: [editFeature]
              };
              applyEdits(edits);
            }
          });

          // *****************************************************
          // btnAddFeature click event
          // create a new feature at the click location
          // *****************************************************
          on(dom.byId("btnAddFeature"), "click", function() {
            featureLayer.definitionExpression = ""
            unselectFeature();
            on.once(view, "click", function(event) {
              event.stopPropagation();

              if (event.mapPoint) {
                point = event.mapPoint.clone();
                point.z = undefined;
                point.hasZ = false;

                newIncident = new Graphic({
                  geometry: point,
                  attributes: {}
                });

                var edits = {
                  addFeatures: [newIncident]
                };

                applyEdits(edits);

                // ui changes in response to creating a new feature
                // display feature update and delete portion of the edit area
                attributeEditing.style.display = "block";
                updateInstructionDiv.style.display = "none";
                dom.byId("viewDiv").style.cursor = "auto";
              }
              else {
                console.error("event.mapPoint is not defined");
              }
            });

            // change the view's mouse cursor once user selects
            // a new incident type to create
            dom.byId("viewDiv").style.cursor = "crosshair";
            editArea.style.cursor = "auto";
          });

          // *****************************************************
          // delete button click event. ApplyEdits is called
          // with the selected feature to be deleted
          // *****************************************************
          on(dom.byId("btnDelete"), "click", function() {
            var edits = {
              deleteFeatures: [editFeature]
            };
            applyEdits(edits);
          });

          // *****************************************************
          // watch for view LOD change. Display Feature editing
          // area when view.zoom level is 14 or higher
          //.catch hide the feature editing area
          // *****************************************************
          view.when(function() {
            watchUtils.whenTrue(view, "stationary", function() {
              if (editExpand) {
                if (view.zoom <= 14) {
                  //editExpand.domNode.style.display = "none";
                }
                else {
                  editExpand.domNode.style.display = "block";
                }
              }
            });
          });
        }

        function handleLayerLoadError(err) {
          console.log("Layer failed to load: ", err);
        }
        
        
        
    });
});