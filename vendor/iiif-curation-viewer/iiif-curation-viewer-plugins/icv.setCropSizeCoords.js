/*
 * IIIF Curation Viewer - Crop size coordinates set plugin
 * http://codh.rois.ac.jp/software/iiif-curation-viewer/
 *
 * Copyright 2020 Center for Open Data in the Humanities, Research Organization of Information and Systems
 * Released under the MIT license
 *
 * Core contributor: Jun HOMMA (@2SC1815J)
 */
var ICVSetCropSizeCoords = function(/*config*/) {
    'use strict';
    var pluginHost = typeof iiifViewer !== 'undefined' ? iiifViewer : void 0;
    var err;

    //依存関係の確認
    if (!pluginHost) {
        err = new Error(); logError('Plugin host not found.', err.lineNumber);
        return;
    }

    //オプション設定
    // var conf = configure(config, {
    // });

    var lng = iiifViewer.getLang();

    var lastDrawEvent;
    modalWindowSetup();

    iiifViewer.setEventHandler(L.Draw.Event.DRAWSTART, function(ev) {
        //console.log(ev);
        //ev: Object { layerType: "rectangle", type: "draw:drawstart", target: Object }
        submenuSetup(ev);
    });
    iiifViewer.setEventHandler(L.Draw.Event.EDITSTART, function(ev) {
        //console.log(ev);
        //ev: Object { handler: "edit", type: "draw:editstart", target: Object }
        submenuSetup(ev);
    });
    function submenuSetup(ev) {
        lastDrawEvent = ev;
        var text = (lng !== 'ja') ? 'Coords Input' : '座標入力';
        var $config = $('<li><a href="#">' + text + '</a></li>').on('click mousedown touchstart', function(e) {
            e.stopPropagation();
            if (lastDrawEvent.control) {
                var map = iiifViewer.getMap();
                var iiif = getIIIFlayer(map);
                if (map && iiif && iiif.x && iiif.y) {
                    var bounds;
                    var drawnItems = lastDrawEvent.control.options.edit.featureGroup;
                    if (drawnItems) {
                        drawnItems.eachLayer(function(layer) {
                            if (layer) {
                                bounds = layer.getBounds();
                            }
                        });
                    }
                    if (bounds) {
                        var minLatLng = bounds.getNorthWest();
                        var maxLatLng = bounds.getSouthEast();
                        var maxCanvasPoint = L.point(iiif.x, iiif.y);
                        var maxCanvasLatLng = map.unproject(maxCanvasPoint, iiif.maxNativeZoom);
                        if (maxCanvasLatLng.lng > 0 && maxCanvasLatLng.lat < 0) {
                            var region = {};
                            region.x = Math.round(iiif.x * minLatLng.lng / maxCanvasLatLng.lng);
                            region.y = Math.round(iiif.y * minLatLng.lat / maxCanvasLatLng.lat);
                            region.width = Math.round(iiif.x * (maxLatLng.lng - minLatLng.lng) / maxCanvasLatLng.lng);
                            region.height = Math.round(iiif.y * (maxLatLng.lat - minLatLng.lat) / maxCanvasLatLng.lat);
                            if (region.x < 0) { region.x = 0; }
                            if (region.y < 0) { region.y = 0; }
                            if (region.width <= 0) { region.width = 1; }
                            if (region.height <= 0) { region.height = 1; }
                            $('#crop_size_coords_xywh').val([region.x, region.y, region.width, region.height].join(','));
                        }
                    } else {
                        $('#crop_size_coords_xywh').val('');
                    }
                }
            }
            iiifViewer.resetSubWindows(function() { $('#crop_size_coords_win').modal('show'); });
        });
        if (lastDrawEvent.type === 'draw:drawstart') {
            $('.leaflet-draw-actions').append($config);
        } else if (lastDrawEvent.type === 'draw:editstart') {
            $('.leaflet-draw-actions li:nth-of-type(1)').after($config);
        }
    }
    function modalWindowSetup() {
        if (document.getElementById('crop_size_coords_win') === null) {
            var title = (lng !== 'ja') ? 'Region selection by coords input' : '座標入力による領域選択';
            //選択サイズ
            var labelCoordsInput = (lng !== 'ja') ? 'x,y,w,h' : 'x,y,w,h';
            var coordsInputPlaceholder = ((lng !== 'ja') ? 'e.g. ' : '例）') + '0,0,100,100';
            var coordsInputPattern = '^[ \t]*([0-9]+)[ \t]*,[ \t]*([0-9]+)[ \t]*,[ \t]*([1-9][0-9]*)[ \t]*,[ \t]*([1-9][0-9]*)[ \t]*$';
            //
            var textApply = (lng !== 'ja') ? 'Apply' : '適用';
            var textClose = (lng !== 'ja') ? 'Close' : '閉じる';
            var setCropSizeConfigModal =
                '<div class="modal fade" tabindex="-1" id="crop_size_coords_win">' +
                '  <div class="modal-dialog modal-sm" id="crop_size_coords_dialog">' +
                '    <div class="modal-content">' +
                '      <div class="modal-body">' +
                '        <h4 id="crop_size_coords_title" class="curation_list_title" style="margin-bottom: 20px;">' + title + '</h4>' +
                '        <form id="crop_size_coords_form" onsubmit="return false;">' +
                '          <div>' +
                '            <fieldset id="crop_size_coords_filedset_xywh">' +
                '              <div class="form-group">' +
                '                <label for="crop_size_coords_xywh" class="control-label">' + labelCoordsInput + '</label>' +
                '                <input class="form-control" id="crop_size_coords_xywh" type="text" pattern="' + coordsInputPattern +'" placeholder="' + coordsInputPlaceholder + '" required>' +
                '                <div class="help-block with-errors"></div>' +
                '              </div>' +
                '            </fieldset>' +
                '          </div>' +
                '        </form>' +
                '      </div>' +
                '      <div class="modal-footer modal-footer-custom">' +
                '        <button type="button" class="btn btn-default" id="crop_size_coords_apply">'+ textApply + '</button>' +
                '        <button type="button" class="btn btn-default" data-dismiss="modal" id="crop_size_coords_close">' + textClose + '</button>' +
                '      </div>' +
                '    </div>' +
                '  </div>' +
                '</div>';
            $('#curation_list_win').after(setCropSizeConfigModal);
            $('#crop_size_coords_win').on('show.bs.modal', function() {
                if ($.fn.validator) {
                    $('#crop_size_coords_form').validator('validate');
                }
            });
            $('#crop_size_coords_win').on('shown.bs.modal', function() {
                $('#crop_size_coords_xywh').focus();
            });
            if ($.fn.validator) {
                $('#crop_size_coords_form').validator();
            }
            $('#crop_size_coords_xywh').on('keydown', function(e) {
                e.stopPropagation();
                if (e.keyCode === 13) { //Enter
                    $('#crop_size_coords_apply').trigger('click');
                }
            });
            $('#crop_size_coords_apply').off('click.coords');
            $('#crop_size_coords_apply').on('click.coords', function(e) {
                //選択サイズ
                var hasNoError = false;
                var xywh = $('#crop_size_coords_xywh').val();
                var x, y, w, h;
                if (xywh) {
                    var match = xywh.match(/^[ \t]*([0-9]+)[ \t]*,[ \t]*([0-9]+)[ \t]*,[ \t]*([1-9][0-9]*)[ \t]*,[ \t]*([1-9][0-9]*)[ \t]*$/);
                    if (match) {
                        x = parseInt(match[1], 10);
                        y = parseInt(match[2], 10);
                        w = parseInt(match[3], 10);
                        h = parseInt(match[4], 10);
                        if (isNaN(x) || isNaN(y) || isNaN(w) || isNaN(h) || w < 1 || h < 1) {
                            //error
                        } else {
                            hasNoError = true;
                        }
                    }
                }
                $('#crop_size_coords_win').modal('hide');
                e.stopPropagation();

                if (hasNoError && lastDrawEvent.control) {
                    var map = iiifViewer.getMap();
                    var iiif = getIIIFlayer(map);
                    if (map && iiif && iiif.x && iiif.y) {
                        var minPoint = L.point(x, y);
                        var maxPoint = L.point(x + w, y + h);
                        var minLatLng = map.unproject(minPoint, iiif.maxNativeZoom);
                        var maxLatLng = map.unproject(maxPoint, iiif.maxNativeZoom);
                        var bounds = L.latLngBounds(minLatLng, maxLatLng);
                        if (lastDrawEvent.type === 'draw:drawstart') {
                            try {
                                var handler = lastDrawEvent.control._toolbars.draw._modes.rectangle.handler;
                                handler._onMouseDown({latlng: minLatLng, originalEvent: new MouseEvent('mousedown')});
                                handler._onMouseMove({latlng: maxLatLng});
                                handler._onMouseUp();
                            } catch(err) {
                                //
                            }
                            map.fitBounds(bounds);
                        } else if (lastDrawEvent.type === 'draw:editstart') {
                            var drawnItems = lastDrawEvent.control.options.edit.featureGroup;
                            if (drawnItems) {
                                drawnItems.eachLayer(function(layer) {
                                    if (layer) {
                                        layer.edited = true; //draw:editresize, draw:editmoveイベントの発出はエミュレートしていない
                                        layer.setBounds(bounds);
                                        map.fitBounds(bounds);
                                    }
                                });
                                try {
                                    lastDrawEvent.control._toolbars.edit._actionButtons[0].button.click();
                                } catch(err) {
                                    //
                                }
                            }
                        }
                    }
                }
            });
        }
    }

    function getIIIFlayer(map) {
        if (map && map._layers) {
            for (var key in map._layers) {
                if (map._layers[key] && map._layers[key].id === 'iiif') {
                    return map._layers[key];
                }
            }
        }
        return null;
    }

    //----------------------------------------------------------------------
    // function configure(config, defaultConfig) {
    //     function helper(conf, input, paramName, paramType) {
    //         if ($.type(input[paramName]) === paramType) {
    //             conf[paramName] = input[paramName];
    //         }
    //     }
    //     var conf_ = defaultConfig;
    //     if ($.isPlainObject(config)) {
    //         //
    //     }
    //     return conf_;
    // }

    function logError(message, lineNumber) {
        if (window.console) {
            var pluginName = 'Crop size coordinates set plugin';
            var msg = (pluginHost ? pluginHost.getName() : 'IIIF Curation Platform') + ' (' + pluginName + '): ';
            var details = [];
            if (message) {
                details.push(message);
            }
            if (lineNumber) {
                details.push('line: ' + lineNumber);
            }
            if (details.length > 0) {
                msg += details.join(', ');
            }
            console.log(msg); // eslint-disable-line no-console
        }
    }
};