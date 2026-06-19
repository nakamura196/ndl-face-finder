/*
 * IIIF Curation Viewer v2.1
 * http://codh.rois.ac.jp/software/iiif-curation-viewer/
 *
 * Copyright 2016 Center for Open Data in the Humanities, Research Organization of Information and Systems
 * Released under the MIT license
 *
 * Core contributor: Jun HOMMA (@2SC1815J)
 *
 * Licenses of open source libraries, see acknowledgements.txt
 */
var IIIFCurationViewer = function(config) {
    'use strict';

    var APP_NAME = 'IIIF Curation Viewer';
    var VERSION  = '2.1.1+20250911';
    if (window.console) {
        console.log(APP_NAME + ' v' + VERSION); // eslint-disable-line no-console
    }
    var APP_URL = 'http://codh.rois.ac.jp/software/iiif-curation-viewer/';

    //リテラルはさほど多くないので、i18n用のフレームワークは用いず、直接記述する。
    var lng = String(window.navigator.language || window.navigator.userLanguage || 'ja').substr(0, 2) !== 'ja' ? 'en' : 'ja';

    var map; //Leaflet

    var bookInfos = [];
    var pageInfos = [];
    var curationInfo = {};

    var isTimelineMode = false;
    var cursorInfo = {
        endpointUrl: null,  //cursor URL
        index: null,    //unix time
        first: null,    //unix time
        last:  null,    //unix time
        prev:  null,    //unix time
        next:  null,    //unix time
        step:  null,    //second
        status: 'fixed' //'fixed'/'updating'
    };

    var page = 0; //0-based（GET引数でのやり取りは1-basedに変換）
    var bookChangePages = []; //資料が切り替わるpage (0-based)
    var isFilteredContents = false; //複数資料のうち、いずれかにおいてページ絞り込みがなされていればtrue
    var pageStep = 1; //ページナビのボタンで移動するコマ数
    var fadeControlsTimerID;
    var annotationDisplayConf = {
        offsetX: 50,
        offsetY: 50,
        opacity: 100,
        size: 50
    };

    var textMarkerRenderOverwrite = false;
    var textMarkerZabutonColor;

    var err;
    var inModalTransitions = 0;

    var enableCurationEdit = true;
    var storage;
    try {
        storage = localStorage;
    } catch (e) {
        enableCurationEdit = false;
    }
    var storageSession;
    try {
        storageSession = sessionStorage;
    } catch (e) {
        //
    }

    var CONTEXT_CURATION = 'http://codh.rois.ac.jp/iiif/curation/1/context.json';
    var CONTEXT_TIMELINE = 'http://codh.rois.ac.jp/iiif/timeline/1/context.json';
    var CONTEXT_CURSOR   = 'http://codh.rois.ac.jp/iiif/cursor/1/context.json';

    var ICV_ERROR = {
        NO_ERROR: 0,            //エラー表示不要（ナビゲーション要素を隠すのみ）
        DOWNLOAD_FAIL: 1,       //データを取得できない
        UNSUPPORTED_VERSION: 2, //対応していないバージョンのIIIFデータ
        INCORRECT_DATA: 3,      //データ異常
        WEB_STORAGE: 4          //Web Storageに問題（QuotaExceededErrorなど）
    };

    var defaultConfig = {
        //タイトル
        //title: APP_NAME, //HTML側に直接記述しているケースを考慮し、デフォルト値は設けない
        //pagesパラメータによるidentifierの指定をmanifestのURLに解決するための設定
        //（このmanifestのURLは、trustedUrlPrefixesに追加しなくても表示が認められる）
        resolveIdentifierSetting: {
            //{scheme}://{server}{/prefix}/{identifier}/manifest
            // manifestUrlPrefix = {scheme}://{server}{/prefix}/
            // identifierPattern = {identifier}
            // manifestUrlSuffix = /manifest
            //e.g. http://example.org/iiif/book/0123456789/manifest.json
            // manifestUrlPrefix = 'http://example.org/iiif/book/'
            // identifierPattern = '[0-9]{9}'
            // manifestUrlSuffix = '/manifest.json'
            manifestUrlPrefix: '',
            identifierPattern: '', //正規表現で指定する
            manifestUrlSuffix: '', //e.g. manifest.json
            numberOfSlashesInIdentifier: 0 //identifierに含まれる'/'の数
        },
        //表示を認めるmanifest/timelineのURL設定
        trustedUrlPrefixes: [], //正規表現不可、前方一致 e.g. ['https://', 'http://']
        curation: {
            enableRectangleMarkerEdit: false //アノテーションビューモード専用キュレーションに対して、枠マーカーの領域編集機能を有効にする
        },
        manifest: {
            steps: [] //ページナビ移動ボタンによる移動コマ数の設定 e.g. [1, 10]
        },
        timeline: {
            steps: [] //ページナビ移動ボタンによる移動コマ数の設定。設定値-1がCursorの返すコマ数以下となるようにすること e.g. [1, 6, 36, 144]
        },
        service: {
            croppedImageExportUrl: '', //関連： getCroppedImageExportHtml()
            curationJsonExportUrl: '', //関連： exportCurationJson()
            mapSelectorUrl: '' //関連: getMapSelectorLink()
        },
        controls: {
            enableAutoHide: true //画像表示領域にマウスオーバーするとコントロールを表示、離れると非表示にする
        },
        showOnLoaded: {
            description: false //読み込み時に、descriptionの記載があれば表示する
        },
        navPlaceMaps: [],
        doc: {
            //言語を分けない場合は、
            // aboutUrl: 'http://codh.rois.ac.jp/software/iiif-curation-viewer/'
            //のように記述しても良い
            aboutUrl: [
                {
                    '@language': 'en',
                    '@value': 'http://codh.rois.ac.jp/software/iiif-curation-viewer/'
                },
                {
                    '@language': 'ja',
                    '@value': 'http://codh.rois.ac.jp/software/iiif-curation-viewer/'
                }
            ]
        }
    };
    var conf = configure(config, defaultConfig);

    var params = getParams(location.search);
    if (params) {
        if ('lang' in params) { //表示言語指定
            // if (params.lang !== 'ja') {
            //     lng = 'en'; //ja以外は全てenにfallback
            // } else {
            //     lng = 'ja';
            // }
            lng = params.lang;
        }
    }

    var iiifConverter = (typeof icpPreziCompat !== 'undefined') ? icpPreziCompat({
        locale: lng,
        enableChoice: false
    }) : undefined;

    setupManifestDroppableArea(); //マニフェストのドラッグ＆ドロップ受け入れ準備
    setupManifestPasteableArea(); //マニフェストURLのペースト受け入れ準備
    setupUILang(); //UI表示言語切り替え

    if (params) {
        if ('pages' in params) { //BookIDによる表示対象指定
            var bookParams = parsePagesParam(params.pages);
            if (bookParams) {
                preprocessManifests(bookParams);
            } else {
                err = new Error(); showError(ICV_ERROR.DOWNLOAD_FAIL, err.lineNumber); //pagesパラメータの値異常
            }
        } else if ('curation' in params) { //curation.jsonのURLによる表示対象指定
            if (params.curation) {
                processCurationUrl(params.curation);
            } else {
                err = new Error(); showError(ICV_ERROR.DOWNLOAD_FAIL, err.lineNumber); //curationパラメータの値異常
            }
        } else if ('manifest' in params) { //manifest.jsonのURLによる表示対象指定
            if (params.manifest) {
                processManifestUrl(params.manifest, params.canvas); //params.canvasは最初に表示するキャンバスのURL（省略可）
            } else {
                err = new Error(); showError(ICV_ERROR.DOWNLOAD_FAIL, err.lineNumber); //manifestパラメータの値異常
            }
        } else if ('timeline' in params) { //timeline.jsonのURLによる表示対象指定
            if (params.timeline) {
                isTimelineMode = true;
                if ('cursorIndex' in params) { //0も取りうる
                    var cursorIndex = getCursorIndexFromProp(params.cursorIndex);
                    if (cursorIndex !== null) {
                        cursorInfo.index = cursorIndex;
                    }
                }
                processTimelineUrl(params.timeline);
            } else {
                err = new Error(); showError(ICV_ERROR.DOWNLOAD_FAIL, err.lineNumber); //timelineパラメータの値異常
            }
        } else if ('iiif-content' in params) {
            if (params['iiif-content']) {
                //単純なケースのみ対応（Load by Referenceやエンコードされた形式には対応しない）
                if (/^https?:\/\//.test(params['iiif-content'])) {
                    processContentUrl(params['iiif-content']);
                }
            }
        } else {
            err = new Error(); showError(ICV_ERROR.NO_ERROR, err.lineNumber); //表示対象指定パラメータなし
        }
    } else {
        err = new Error(); showError(ICV_ERROR.NO_ERROR, err.lineNumber); //GET引数なし
    }
    function setupUILang() {
        $('html').attr('lang', lng);
        //コンテンツを表示していない（setupNavigations()が呼ばれない）時点での表示言語切り替え等
        if ($('.nav_lang_ja').length && $('.nav_lang_en').length) {
            if (lng !== 'ja') {
                var $ja = $('<a>').attr('href', '?lang=ja').text('日本語');
                $('.nav_lang_ja').html($ja);
                $('.nav_lang_en').text('English');
            } else {
                var $en = $('<a>').attr('href', '?lang=en').text('English');
                $('.nav_lang_ja').text('日本語');
                $('.nav_lang_en').html($en);
            }
        }
        //タイトル
        if ('title' in conf) { //設定がある場合だけ、HTMLでの指定を上書き
            var title = getPropertyValueI18n(conf.title);
            $('#navbar_brand').html(title);
            document.title = $('#navbar_brand').text();
            $('#book_title').text(document.title);
        }
        //ヘッダ
        var $navbarBrandLink = $('a#navbar_brand');
        if (!$navbarBrandLink.attr('data-href-orig')) { //オリジナルのhrefを待避
            $navbarBrandLink.attr('data-href-orig', $navbarBrandLink.attr('href'));
        }
        var hrefOrig = $navbarBrandLink.attr('data-href-orig');
        var hrefNew = hrefOrig + ((String(hrefOrig).indexOf('?') > -1) ? '&' : '?') + 'lang=' + lng;
        $navbarBrandLink.attr('href', hrefNew);
    }

    //----------------------------------------------------------------------
    function configure(config, defaultConfig) {
        var conf_ = defaultConfig;
        var i;
        if ($.isPlainObject(config)) {
            if ($.type(config.title) === 'string' || $.type(config.title) === 'array') {
                conf_.title = config.title;
            }
            if ($.isPlainObject(config.resolveIdentifierSetting)) {
                if ($.type(config.resolveIdentifierSetting.manifestUrlPrefix) === 'string') {
                    var manifestUrlPrefix = config.resolveIdentifierSetting.manifestUrlPrefix;
                    if (manifestUrlPrefix && manifestUrlPrefix.slice(-1) !== '/') { //記載漏れ救済
                        manifestUrlPrefix = manifestUrlPrefix + '/';
                    }
                    conf_.resolveIdentifierSetting.manifestUrlPrefix = manifestUrlPrefix;
                }
                if ($.type(config.resolveIdentifierSetting.identifierPattern) === 'string') {
                    conf_.resolveIdentifierSetting.identifierPattern = config.resolveIdentifierSetting.identifierPattern;
                }
                if ($.type(config.resolveIdentifierSetting.manifestUrlSuffix) === 'string') {
                    conf_.resolveIdentifierSetting.manifestUrlSuffix = config.resolveIdentifierSetting.manifestUrlSuffix;
                }
                if ($.type(config.resolveIdentifierSetting.numberOfSlashesInIdentifier) === 'number') {
                    conf_.resolveIdentifierSetting.numberOfSlashesInIdentifier = config.resolveIdentifierSetting.numberOfSlashesInIdentifier;
                }
            }
            if ($.isArray(config.trustedUrlPrefixes)) {
                var trustedUrlPrefixes = [];
                for (i = 0; i < config.trustedUrlPrefixes.length; i++) {
                    var trustedUrlPrefix = config.trustedUrlPrefixes[i];
                    if (trustedUrlPrefix && $.type(trustedUrlPrefix) === 'string') {
                        var href = getAbsoluteUrl(trustedUrlPrefix);
                        if (href) {
                            href = href.replace(/:\/\/\/$/, '://'); //workaround for Firefox ESR 52 incompatibility
                            trustedUrlPrefixes.push(href);
                        }
                    }
                }
                conf_.trustedUrlPrefixes = trustedUrlPrefixes;
            }
            if ($.isPlainObject(config.showOnLoaded)) {
                if ($.type(config.showOnLoaded.description) === 'boolean') {
                    conf_.showOnLoaded.description = config.showOnLoaded.description;
                }
            }
            if ($.isArray(config.navPlaceMaps)) {
                var navPlaceMaps = [];
                for (i = 0; i < config.navPlaceMaps.length; i++) {
                    var navPlace = config.navPlaceMaps[i];
                    if ($.isPlainObject(navPlace)) {
                        navPlaceMaps.push(navPlace);
                    }
                }
                conf_.navPlaceMaps = navPlaceMaps;
            }
            if ($.isPlainObject(config.curation)) {
                if ($.type(config.curation.enableRectangleMarkerEdit) === 'boolean') {
                    conf_.curation.enableRectangleMarkerEdit = config.curation.enableRectangleMarkerEdit;
                }
            }
            if ($.isPlainObject(config.manifest)) {
                if ($.isArray(config.manifest.steps)) {
                    var pageSteps = [];
                    for (i = 0; i < config.manifest.steps.length; i++) {
                        var pageStep = config.manifest.steps[i];
                        if ($.type(pageStep) === 'number') {
                            pageSteps.push(pageStep);
                        }
                    }
                    conf_.manifest.steps = pageSteps;
                }
            }
            if ($.isPlainObject(config.timeline)) {
                if ($.isArray(config.timeline.steps)) {
                    var timelineSteps = [];
                    for (i = 0; i < config.timeline.steps.length; i++) {
                        var timelineStep = config.timeline.steps[i];
                        if ($.type(timelineStep) === 'number') {
                            timelineSteps.push(timelineStep);
                        }
                    }
                    conf_.timeline.steps = timelineSteps;
                }
            }
            if ($.isPlainObject(config.service)) {
                if ($.type(config.service.croppedImageExportUrl) === 'string') {
                    conf_.service.croppedImageExportUrl = config.service.croppedImageExportUrl;
                }
                if ($.type(config.service.curationJsonExportUrl) === 'string') {
                    conf_.service.curationJsonExportUrl = config.service.curationJsonExportUrl;
                }
                if ($.type(config.service.mapSelectorUrl) === 'string') {
                    conf_.service.mapSelectorUrl = config.service.mapSelectorUrl;
                }
            }
            if ($.isPlainObject(config.controls)) {
                if ($.type(config.controls.enableAutoHide) === 'boolean') {
                    conf_.controls.enableAutoHide = config.controls.enableAutoHide;
                }
            }
            if ($.isPlainObject(config.doc)) {
                if ($.type(config.doc.aboutUrl) === 'string' || $.type(config.doc.aboutUrl) === 'array') {
                    conf_.doc.aboutUrl = config.doc.aboutUrl;
                }
            }
        }
        conf_.service.croppedImageExport = conf_.service.croppedImageExportUrl;
        conf_.service.curationJsonExport = conf_.service.curationJsonExportUrl;
        return conf_;
    }

    function setupManifestDroppableArea() {
        // manifest drag and drop
        var $droppable = $('#image_canvas');
        $droppable.on('dragover', function(e) {
            e.stopPropagation();
            e.preventDefault();
        });
        $droppable.on('dragenter', function(e) {
            e.stopPropagation();
            e.preventDefault();
            $(this).addClass('manifest_dragging');
        });
        $droppable.on('drop', function(e) {
            e.preventDefault();
            $(this).removeClass('manifest_dragging');
            var url = e.originalEvent.dataTransfer.getData('URL') ||
                e.originalEvent.dataTransfer.getData('text/plain');
            processDroppedOrPastedUrl(url);
        });
        $(document).on('dragenter', function(e) {
            e.stopPropagation();
            e.preventDefault();
            $droppable.removeClass('manifest_dragging');
        });
        $(document).on('dragover drop', function(e) {
            e.stopPropagation();
            e.preventDefault();
        });
    }
    function setupManifestPasteableArea() {
        var $pasteable = $('#url_pasteable').attr('contenteditable', 'true');
        $('#usage_tip').attr('placeholder', (lng !== 'ja') ? 'Drop or paste a IIIF manifest/curation URL' : 'IIIFマニフェスト／キュレーションURLをドロップまたはペースト');
        $pasteable.on('paste', function(e) {
            e.preventDefault();
            $pasteable.attr('contenteditable', 'false');
            /*
                以下のように記述しても、IEを含めて正しく動作する。
                var url = (e.originalEvent.clipboardData || window.clipboardData).getData('text');
                https://developer.mozilla.org/en-US/docs/Web/API/Element/paste_event

                しかし、IIIF Content State API 1.0では、
                formatは「must be "text/plain"」としているので、仕様を満たすためそれに従う。
                https://iiif.io/api/content-state/1.0/#initialization-mechanisms-paste

                もっとも、HTML Living Standardでは、
                「If format equals "text", change it to "text/plain"」とされており、
                MDNの例示通り"text"を指定しても、モダンなブラウザでは内部で"text/plain"に変換され、
                結局、IEでもそれ以外でも正しく動作する。
                https://html.spec.whatwg.org/multipage/dnd.html#dom-datatransfer-getdata
            */
            var url;
            if (e.originalEvent.clipboardData) {
                url = e.originalEvent.clipboardData.getData('text/plain');
            } else if (window.clipboardData) { //IE
                url = window.clipboardData.getData('text');
            }
            processDroppedOrPastedUrl(url);
        });
        $pasteable.on('keydown', function(e) {
            if (e.ctrlKey) {
                //
            } else {
                e.preventDefault();
            }
        });
        $pasteable.on('input', function() {
            $pasteable.text('');
        });
    }
    function processDroppedOrPastedUrl(url) {
        function extractIIIFResourceUrl(url) {
            var result = {};
            if (url) {
                var iiifContentUrl;
                var curationUrl;
                var manifestUrl;
                var canvasUrl;
                var qpos = url.indexOf('?');
                if (qpos > -1) {
                    //GETパラメータからマニフェストURL等を抽出
                    var base = url.substring(0, qpos) || undefined;
                    var search = url.substring(qpos);
                    var params_ = getParams(search);
                    if (params_) {
                        if (params_.curation) {
                            curationUrl = getAbsoluteUrlModern(params_.curation, base);
                        }
                        if (params_.manifest) {
                            manifestUrl = getAbsoluteUrlModern(params_.manifest, base);
                        }
                        if (params_.canvas) {
                            canvasUrl = getAbsoluteUrlModern(params_.canvas, base);
                        }
                        if (params_['iiif-content']) {
                            //単純なケースのみ対応（Load by Referenceやエンコードされた形式には対応しない）
                            if (/^https?:\/\//.test(params_['iiif-content'])) {
                                iiifContentUrl = params_['iiif-content'];
                            }
                        }
                    }
                }
                result = {
                    iiifContentUrl: iiifContentUrl,
                    curationUrl: curationUrl,
                    manifestUrl: manifestUrl,
                    canvasUrl: canvasUrl
                };
            }
            return result;
        }
        if (url) {
            var userAgent = window.navigator.userAgent.toLowerCase();
            var isIE = (userAgent.indexOf('msie') != -1 || userAgent.indexOf('trident') != -1);
            var urls = extractIIIFResourceUrl(url);
            page = 0;
            params = {};
            if (urls.curationUrl) {
                params.curation = urls.curationUrl;
            } else if (urls.manifestUrl) {
                params.manifest = urls.manifestUrl;
                if (urls.canvasUrl) {
                    params.canvas = urls.canvasUrl;
                }
            } else if (urls.iiifContentUrl) {
                params['iiif-content'] = urls.iiifContentUrl;
            } else if (isIE) {
                params['iiif-content'] = url;
            }
            bookInfos = [];
            pageInfos = [];
            curationInfo = {};
            isTimelineMode = false;
            updateHistory();
            if (isIE) {
                //IEでは、processManifestUrl()すると$.getJSON()でエラー(Invalid argument)になる
                location.reload();
            } else {
                if (params.curation) {
                    processCurationUrl(params.curation);
                } else if (params.manifest) {
                    processManifestUrl(params.manifest, params.canvasUrl);
                } else {
                    processContentUrl(urls.iiifContentUrl || url);
                }
            }
        }
    }

    function getParams(search) {
        var query = search.substring(1);
        if (query !== '') {
            var params = query.split('&');
            var paramsObj = {};
            for (var i = 0; i < params.length; i++) {
                var elems = params[i].split('=');
                if (elems.length > 1) {
                    var key = decodeURIComponent(elems[0]);
                    var val = decodeURIComponent(elems[1]);
                    paramsObj[key] = val;
                }
            }
            return paramsObj;
        } else {
            return null;
        }
    }

    function parsePagesParam(param) {
        if (!param) { return null; }
        var result = [];
        var books = param.split(':');
        for (var i = 0; i < books.length; i++) {
            var elems = books[i].split('/');
            var pageDataIndex = conf.resolveIdentifierSetting.numberOfSlashesInIdentifier + 1;
            var identifier = elems[0];
            if (elems.length > pageDataIndex - 1) {
                identifier = elems.slice(0, pageDataIndex).join('/');
            }
            if (!isValidIdentifier(identifier)) {
                continue;
            }
            var hasInvalidParam = false;
            var isFiltered = false;
            var pageRanges = [];
            if (elems.length > pageDataIndex && elems[pageDataIndex].length > 0) {
                //ページ絞り込みあり
                var pages = elems[pageDataIndex].split(',');
                for (var j = 0; j < pages.length; j++) {
                    var match = pages[j].match(/^(-?[0-9]+)(?:-(-?[0-9]+))?$/); //負数も認める
                    if (match) {
                        var startPage = parseInt(match[1], 10);
                        var endPage = startPage;
                        if (match[2] !== undefined) {
                            endPage = parseInt(match[2], 10);
                        }
                        if (startPage === 0 || endPage === 0) { //0は不可
                            hasInvalidParam = true;
                            break;
                        }
                        var pageRange = {
                            from : startPage, //1-based
                            to   : endPage    //1-based
                        };
                        pageRanges.push(pageRange);
                    } else {
                        hasInvalidParam = true;
                        break;
                    }
                }
                //結果的に元資料と同じ順番で全ページ表示されることになったとしても、
                //ページ絞り込みありとして扱う。
                isFiltered = true;
            } else {
                //ページ絞り込みなし（全ページが対象）
                pageRanges.push({ from: 1, to: -1 }); //-1は最終ページを意味する
                isFiltered = false;
            }
            if (!hasInvalidParam) {
                var manifestUrl = getManifestUrlFromIdentifier(identifier);
                if (manifestUrl) {
                    var bookParam = {
                        manifestUrl : manifestUrl,
                        pageRanges  : pageRanges,
                        isFiltered  : isFiltered
                    };
                    result.push(bookParam);
                }
            }
        }
        return (result.length > 0) ? result : null;
    }

    function isBorderMarkerEditingEnabled() {
        return (conf.curation.enableRectangleMarkerEdit && curationInfo.curation && curationInfo.curation.viewingHint === 'annotation');
    }

    //----------------------------------------------------------------------
    function showLoadingMessage() {
        $('#book_title').text((lng !== 'ja') ? 'Loading...' : '読み込み中です...');
        $('#page_navigation').hide();
        $('#image_canvas').removeClass('no_contents');
        $('#usage_tip_wrapper').remove();
        $('#url_pasteable').remove();
    }

    //---------- curation/manifest関係 ----------
    function processContentUrl(url) {
        showLoadingMessage();
        $.getJSON(url, function(data) {
            delete params['iiif-content'];
            if (isValidCurationFalseTrue(data)) {
                params.curation = url;
                processCurationUrl(url, data);
            } else {
                params.manifest = url;
                processManifestUrl(url, undefined, data);
            }
        }).fail(function(jqxhr, textStatus, error) {
            err = new Error(); showError(ICV_ERROR.DOWNLOAD_FAIL, err.lineNumber, textStatus + ', ' + error); //jsonの取得に失敗(content)
        });
    }

    //---------- curation関係 ----------
    //curationパラメータで指定されたcurationの取得 → preprocessManifestsまたはpreprocessTimelinesで内容処理
    function processCurationUrl(curationUrl, options) {
        function processCurationCore(curationUrl, curation_) {
            if (isValidCurationFalseTrue(curation_)) {
                curationUrl = getAbsoluteUrl(curationUrl);
                var isAnnotationViewMode = false;
                if (getMode() === 'annotation' || curation_.viewingHint === 'annotation') {
                    //アノテーションビューモード
                    setMode('annotation');
                    isAnnotationViewMode = true;
                    enableCurationEdit = false;
                }
                //selectionsプロパティ
                var bookParams = [];
                var timelineParams = [];
                for (var i = 0; i < curation_.selections.length; i++) {
                    var range = curation_.selections[i];
                    // http://iiif.io/api/presentation/2.1/#range
                    if ($.isPlainObject(range) && range['@type'] === 'sc:Range') {
                        if (range.within) { //withinプロパティ
                            var manifestUrl = '';
                            var timelineUrl = '';
                            var within = range.within;
                            if ($.type(within) === 'string') {
                                if (within && /^https?:\/\//.test(within)) { //絶対URLのみ認める
                                    manifestUrl = within;
                                }
                            } else if ($.isPlainObject(within) && within['@id'] && within['@type'] && $.type(within['@id']) === 'string') {
                                if (within['@id'] && /^https?:\/\//.test(within['@id'])) { //絶対URLのみ認める
                                    if (within['@type'] === 'sc:Manifest') {
                                        manifestUrl = within['@id'];
                                    } else if (within['@type'] === 'tl:Manifest' || within['@type'] === 'codh:Manifest') {
                                        timelineUrl = within['@id'];
                                    }
                                }
                            }
                            if (manifestUrl && isTrustedManifestUrl(manifestUrl)) {
                                var canvasIds = [];
                                var annots = [];
                                var j;
                                if ($.isArray(range.canvases)) { //Rangeのcanvasesプロパティによる表示対象指定
                                    if (!isAnnotationViewMode) {
                                        //キュレーションビューモード
                                        canvasIds = range.canvases; //canvasの@idの配列
                                    } else {
                                        //アノテーションビューモード
                                        for (j = 0; j < range.canvases.length; j++) {
                                            var canvasIdBase_ = range.canvases[j].split('#')[0];
                                            if (canvasIdBase_ && $.inArray(canvasIdBase_, canvasIds) === -1) {
                                                canvasIds.push(canvasIdBase_);
                                            }
                                            //canvasesプロパティによる列挙ではcanvasに対するmetadataは記載できず、アノテーション情報はない
                                            //対象領域をアノテーションに変換した情報を付加
                                            var tempAnnot_ = {
                                                '@id': 'http://example.org/iiif/annotation/anno' + String(i) + '_' + String(j),
                                                '@type': 'oa:Annotation',
                                                'motivation': 'sc:painting',
                                                'resource': {
                                                    '@type': 'cnt:ContentAsText',
                                                    'chars': '',
                                                    'format': 'text/plain',
                                                    'marker': {
                                                        'border-color': '#00BFFF'
                                                    }
                                                },
                                                'on': range.canvases[j]
                                            };
                                            annots.push(tempAnnot_);
                                        }
                                    }
                                } else if ($.isArray(range.members)) { //membersプロパティによる表示対象指定
                                    //membersプロパティ内では、sc:Canvasのみ対応。membersプロパティ内のsc:Rangeは未対応。
                                    for (j = 0; j < range.members.length; j++) {
                                        var member = range.members[j];
                                        if ($.isPlainObject(member) && member['@id'] && member['@type']) {
                                            if (member['@type'] === 'sc:Canvas') {
                                                if (!isAnnotationViewMode) {
                                                    //キュレーションビューモード
                                                    canvasIds.push(member['@id']);
                                                } else {
                                                    //アノテーションビューモード
                                                    //フラグメントの差異は集約する
                                                    var canvasIdBase = member['@id'].split('#')[0];
                                                    if (canvasIdBase && $.inArray(canvasIdBase, canvasIds) === -1) {
                                                        canvasIds.push(canvasIdBase);
                                                    }
                                                    var foundAnnotationInMetadata = false;
                                                    var metadataString = '';
                                                    if ('metadata' in member) {
                                                        if ($.isArray(member.metadata)) {
                                                            for (var m = 0; m < member.metadata.length; m++) {
                                                                var metadatum = member.metadata[m];
                                                                if (metadatum && String(metadatum.label).toLowerCase() === 'annotation' && $.isArray(metadatum.value)) {
                                                                    foundAnnotationInMetadata = true;
                                                                    for (var n = 0; n < metadatum.value.length; n++) {
                                                                        var annotation = metadatum.value[n];
                                                                        if ($.isPlainObject(annotation) && annotation['@id'] && annotation['@type'] === 'oa:Annotation' &&
                                                                            annotation.motivation === 'sc:painting' && $.isPlainObject(annotation.resource)) {
                                                                            annotation.on = annotation.on || member['@id']; //curationInfo.curation に反映される
                                                                            annots.push(annotation);
                                                                        }
                                                                    }
                                                                }
                                                            }
                                                        }
                                                        if (!foundAnnotationInMetadata) {
                                                            metadataString += getLabelValuePair(member.metadata);
                                                        }
                                                    }
                                                    if (!foundAnnotationInMetadata) {
                                                        //metadata内にアノテーション情報がない場合、metadataをアノテーションに変換した情報を付加
                                                        var tempAnnot = {
                                                            '@id': 'http://example.org/iiif/annotation/anno' + String(i) + '_' + String(j),
                                                            '@type': 'oa:Annotation',
                                                            'motivation': 'sc:painting',
                                                            'resource': {
                                                                '@type': 'cnt:ContentAsText',
                                                                'chars': metadataString ? unescapeLimitedHtmlTag($('<span>').text(metadataString).prop('outerHTML')) : '',
                                                                'format': 'text/html',
                                                                'marker': {
                                                                    'border-color': '#00BFFF'
                                                                }
                                                            },
                                                            'on': member['@id']
                                                        };
                                                        annots.push(tempAnnot);
                                                    }
                                                }
                                            }
                                        }
                                    }
                                }
                                if (canvasIds.length > 0) {
                                    var bookParam = {
                                        manifestUrl : manifestUrl,
                                        canvasIds   : canvasIds,
                                        isFiltered  : true //結果的に元資料と同じ順番で全ページ表示されることになったとしても、ページ絞り込みありとして扱う。
                                    };
                                    if (isAnnotationViewMode) {
                                        //アノテーションビューモード
                                        bookParam.annotations = annots;
                                    }
                                    bookParams.push(bookParam);
                                }
                            } else if (timelineUrl && isTrustedTimelineUrl(timelineUrl)) {
                                var canvasIds_ = [];
                                var canvasIndices = [];
                                var annots_ = [];
                                if ($.isArray(range.members)) { //membersプロパティによる表示対象指定のみ有効
                                    //membersプロパティ内では、sc:Canvasのみ対応。membersプロパティ内のsc:Rangeは未対応。
                                    for (var k = 0; k < range.members.length; k++) {
                                        var member_ = range.members[k];
                                        if ($.isPlainObject(member_) && member_['@id'] && member_['@type']) {
                                            if (!isAnnotationViewMode) {
                                                //キューレションビューモード
                                                var cursorIndex = getCursorIndexFromCanvas(member_);
                                                if (cursorIndex !== null) {
                                                    canvasIds_.push(member_['@id']);
                                                    canvasIndices.push(cursorIndex);
                                                }
                                            } else {
                                                //アノテーションビューモード
                                                var cursorIndex_ = getCursorIndexFromCanvas(member_);
                                                if (cursorIndex_ !== null && $.inArray(cursorIndex_, canvasIndices) === -1) {
                                                    //フラグメントの差異は集約する
                                                    var canvasIdBase__ = member_['@id'].split('#')[0];
                                                    if (canvasIdBase__ && $.inArray(canvasIdBase__, canvasIds_) === -1) {
                                                        canvasIds_.push(canvasIdBase__);
                                                        canvasIndices.push(cursorIndex_);
                                                    }
                                                }
                                                var foundAnnotationInMetadata_ = false;
                                                var metadataString_ = '';
                                                if ('metadata' in member_) {
                                                    if ($.isArray(member_.metadata)) {
                                                        for (var m_ = 0; m_ < member_.metadata.length; m_++) {
                                                            var metadatum_ = member_.metadata[m_];
                                                            if (metadatum_ && String(metadatum_.label).toLowerCase() === 'annotation' && $.isArray(metadatum_.value)) {
                                                                foundAnnotationInMetadata_ = true;
                                                                for (var n_ = 0; n_ < metadatum_.value.length; n_++) {
                                                                    var annotation_ = metadatum_.value[n_];
                                                                    if ($.isPlainObject(annotation_) && annotation_['@id'] && annotation_['@type'] === 'oa:Annotation' &&
                                                                        annotation_.motivation === 'sc:painting' && $.isPlainObject(annotation_.resource)) {
                                                                        annotation_.on = annotation_.on || member_['@id'];
                                                                        annots_.push(annotation_);
                                                                    }
                                                                }
                                                            }
                                                        }
                                                    }
                                                    if (!foundAnnotationInMetadata_) {
                                                        metadataString_ += getLabelValuePair(member_.metadata);
                                                    }
                                                }
                                                if (!foundAnnotationInMetadata_) {
                                                    //metadata内にアノテーション情報がない場合、metadataをアノテーションに変換した情報を付加
                                                    var tempAnnot__ = {
                                                        '@id': 'http://example.org/iiif/annotation/anno' + String(i) + '_' + String(k),
                                                        '@type': 'oa:Annotation',
                                                        'motivation': 'sc:painting',
                                                        'resource': {
                                                            '@type': 'cnt:ContentAsText',
                                                            'chars': metadataString_ ? unescapeLimitedHtmlTag($('<span>').text(metadataString_).prop('outerHTML')) : '',
                                                            'format': 'text/html',
                                                            'marker': {
                                                                'border-color': '#00BFFF'
                                                            }
                                                        },
                                                        'on': member_['@id']
                                                    };
                                                    annots_.push(tempAnnot__);
                                                }
                                            }
                                        }
                                    }
                                }
                                if (canvasIds_.length > 0) {
                                    var timelineParam = {
                                        manifestUrl   : timelineUrl,
                                        canvasIds     : canvasIds_,
                                        canvasIndices : canvasIndices,
                                        isFiltered    : true
                                    };
                                    if (isAnnotationViewMode) {
                                        //アノテーションビューモード
                                        timelineParam.annotations = annots_;
                                    }
                                    timelineParams.push(timelineParam);
                                }
                            }
                        }
                    }
                }
                //timelineと非timelineの混在指定は未対応
                if (bookParams.length > 0) {
                    curationInfo = {
                        curation: curation_,
                        curationUrl: curationUrl
                    };
                    preprocessManifests(bookParams);
                } else if (timelineParams.length > 0) {
                    curationInfo = {
                        curation: curation_,
                        curationUrl: curationUrl
                    };
                    preprocessTimelines(timelineParams);
                } else {
                    err = new Error(); showError(ICV_ERROR.INCORRECT_DATA, err.lineNumber); //selectionsプロパティ記載異常
                }
            } else {
                err = new Error(); showError(ICV_ERROR.INCORRECT_DATA, err.lineNumber); //json異常（invalidもしくは対応外の内容）(curation)
            }
        }
        showLoadingMessage();
        if ($.isPlainObject(options) && options.data) {
            processCurationCore(curationUrl, options.data);
        } else {
            $.getJSON(curationUrl, function(curation_) {
                processCurationCore(curationUrl, curation_);
            }).fail(function(jqxhr, textStatus, error) {
                err = new Error(); showError(ICV_ERROR.DOWNLOAD_FAIL, err.lineNumber, textStatus + ', ' + error); //jsonの取得に失敗(curation)
            });
        }
    }

    //---------- timeline関係 ----------
    //curation.json内で指定されたtimeline(s)の取得 → processTimelinesで内容処理
    function preprocessTimelines(timelineParams) {
        showLoadingMessage();
        var i;
        var timelineParamsAggregated = []; //timelineParamsをtimelineUrlによって集計したもの
        {
            var timelineUrls = [];
            var timelineCanvasIds = []; //配列の配列になる
            var timelineCanvasIndices = []; //配列の配列になる
            for (i = 0; i < timelineParams.length; i++) {
                var idx = $.inArray(timelineParams[i].manifestUrl, timelineUrls);
                if (idx === -1) {
                    timelineUrls.push(timelineParams[i].manifestUrl);
                    timelineCanvasIds.push(timelineParams[i].canvasIds);
                    timelineCanvasIndices.push(timelineParams[i].canvasIndices);
                } else {
                    $.merge(timelineCanvasIds[idx], timelineParams[i].canvasIds);
                    $.merge(timelineCanvasIndices[idx], timelineParams[i].canvasIndices);
                }
            }
            for (i = 0; i < timelineUrls.length; i++) {
                var timelineParam = {
                    manifestUrl   : timelineUrls[i],
                    canvasIds     : timelineCanvasIds[i],
                    canvasIndices : timelineCanvasIndices[i],
                    isFiltered    : true
                };
                timelineParamsAggregated.push(timelineParam);
            }
        }
        var deferreds = [];
        for (i = 0; i < timelineParamsAggregated.length; i++) {
            deferreds.push($.getJSON(timelineParamsAggregated[i].manifestUrl));
        }
        $.when.apply($, deferreds).done(function() {
            //全てのtimeline.json取得に成功してから
            var timelines = [];
            if (deferreds.length === 1 && arguments[1] === 'success') {
                timelines.push(arguments[0]);
            } else {
                for (i = 0; i < deferreds.length; i++) {
                    if (arguments[i][1] === 'success') {
                        timelines.push(arguments[i][0]);
                    }
                }
            }
            if (deferreds.length === timelines.length) {
                processTimelines(timelines, timelineParamsAggregated, timelineParams);
            } else {
                err = new Error(); showError(ICV_ERROR.DOWNLOAD_FAIL, err.lineNumber); //jsonの取得時に'success'でないものがある(timeline)
            }
        }).fail(function(jqxhr, textStatus, error) {
            err = new Error(); showError(ICV_ERROR.DOWNLOAD_FAIL, err.lineNumber, textStatus + ', ' + error); //jsonの取得に失敗(timelines)
        });
    }

    //timeline(s)の内容に基づいてcursor(s)を取得 → processCursorsで内容処理
    function processTimelines(timelines, timelineParamsAggregated, timelineParams) {
        var i, j;
        var deferreds = [];
        var timelineParamsExt = [];
        for (i = 0; i < timelines.length; i++) {
            var timeline = timelines[i];
            if (isValidTimelineFalseTrue(timeline)) {
                var cursor = timeline.cursors[0];
                var cursorEndpointUrl = getCursorEndpointUrlFromCursor(cursor);
                if (!cursorEndpointUrl) {
                    continue;
                }

                var timelineUrl = timelineParamsAggregated[i].manifestUrl;
                var canvasIds = timelineParamsAggregated[i].canvasIds;
                var canvasIndices = timelineParamsAggregated[i].canvasIndices;

                //キュレーションにより、同一のコマ（fragment付きを含む）が複数挙げられている場合、
                //同一のcursorIndexに対してCursorを複数回取得するのは非効率なので、cursorIndexで束ねる。
                //あるcursorIndexで取得したCursorの中から、どのCanvasIdのものを探せば良いか分かるように、
                //cursorIndexとCanvasIdの対応関係をリストアップしておく
                var cursorIndexToCanvasIdsMap = [];
                for (j = 0; j < canvasIds.length; j++) {
                    var canvasId = canvasIds[j];
                    var cursorIndex = canvasIndices[j];
                    if (cursorIndexToCanvasIdsMap[cursorIndex]) {
                        if ($.inArray(cursorIndexToCanvasIdsMap[cursorIndex], canvasId) === -1) {
                            cursorIndexToCanvasIdsMap[cursorIndex].push(canvasId);
                        }
                    } else {
                        cursorIndexToCanvasIdsMap[cursorIndex] = [canvasId];
                    }
                }

                var cursorFirst = getCursorIndexFromProp(cursor.first);
                var cursorLast = getCursorIndexFromProp(cursor.last);
                var validCursorIndices = []; //配列
                var validCursorIndexCanvasIds = []; //配列の配列
                for (j = 0; j < canvasIndices.length; j++) {
                    var cursorIndex_ = canvasIndices[j];
                    var isInvalidCursorIndex = false;
                    if (cursorFirst !== null && cursorIndex_ < cursorFirst) {
                        isInvalidCursorIndex = true;
                    }
                    if (cursorLast !== null && cursorIndex_ > cursorLast) {
                        isInvalidCursorIndex = true;
                    }
                    if (!isInvalidCursorIndex) {
                        if ($.inArray(cursorIndex_, validCursorIndices) === -1) { //重複を除去
                            if (getCursorUrl(cursorEndpointUrl, cursorIndex_)) {
                                validCursorIndices.push(cursorIndex_);
                                validCursorIndexCanvasIds.push(cursorIndexToCanvasIdsMap[cursorIndex_]);
                            }
                        }
                    }
                }

                for (j = 0; j < validCursorIndices.length; j++) {
                    var cursorUrl = getCursorUrl(cursorEndpointUrl, validCursorIndices[j]);
                    if (cursorUrl) {
                        deferreds.push($.getJSON(cursorUrl));
                    }
                }

                var timelineParamExt = {
                    timeline      : timeline,
                    timelineUrl   : timelineUrl,
                    cursorIndexCanvasIds : validCursorIndexCanvasIds //配列の配列
                };
                timelineParamsExt.push(timelineParamExt);

            } else {
                //err = new Error(); showError(ICV_ERROR.INCORRECT_DATA, err.lineNumber); //json異常（invalidもしくは対応外の内容）(timeline)
            }
        }
        $.when.apply($, deferreds).done(function() {
            //全てのcursor取得に成功してから
            var cursors = [];
            if (deferreds.length === 1 && arguments[1] === 'success') {
                cursors.push(arguments[0]);
            } else {
                for (i = 0; i < deferreds.length; i++) {
                    if (arguments[i][1] === 'success') {
                        cursors.push(arguments[i][0]);
                    }
                }
            }
            if (deferreds.length === cursors.length) {
                processCursors(cursors, timelineParamsExt, timelineParams);
            } else {
                err = new Error(); showError(ICV_ERROR.DOWNLOAD_FAIL, err.lineNumber); //jsonの取得時に'success'でないものがある(cursor)
            }
        }).fail(function(jqxhr, textStatus, error) {
            err = new Error(); showError(ICV_ERROR.DOWNLOAD_FAIL, err.lineNumber, textStatus + ', ' + error); //jsonの取得に失敗(cursors)
        });
    }

    //timeline(s)とcursors(s)の内容をマージ → processManifestsで内容処理
    function processCursors(cursors, timelineParamsExt, timelineParams) {
        var argc = 0;
        var timelines = [];
        var timelineUrls = [];
        for (var i = 0; i < timelineParamsExt.length; i++) {
            var timeline = timelineParamsExt[i].timeline;
            var cursorIndexCanvasIds = timelineParamsExt[i].cursorIndexCanvasIds; //配列の配列
            var canvases = []; //Canvasオブジェクトの配列
            for (var j = 0; j < cursorIndexCanvasIds.length; j++) {
                var cursor = cursors[argc++];
                if (isValidCursorFalseTrue(cursor)) {
                    var canvasIds = cursorIndexCanvasIds[j]; //このCursorの中で探すべきCanvasIdの配列
                    for (var k = 0; k < canvasIds.length; k++) {
                        var canvasId = canvasIds[k].split('#')[0];
                        for (var m = 0; m < cursor.sequence.canvases.length; m++) {
                            var canvas = cursor.sequence.canvases[m];
                            if (canvas && canvas['@id'] === canvasId) {
                                canvases.push(canvas);
                                break;
                            }
                        }
                    }
                }
            }
            $.unique(canvases);
            if ($.isArray(timeline.sequences)) {
                timeline.sequences[0].canvases = canvases;
            } else {
                timeline.sequences = [
                    {
                        '@type': 'sc:Sequence',
                        'canvases': canvases
                    }
                ];
            }
            timelines.push(timeline);
            timelineUrls.push(timelineParamsExt[i].timelineUrl);
        }
        isTimelineMode = true;
        processManifests(timelines, timelineUrls, timelineParams);
    }

    //timelineパラメータで指定されたtimelineの取得 → processCursorUrlで内容処理
    function processTimelineUrl(timelineUrl) {
        showLoadingMessage();
        if (isTrustedTimelineUrl(timelineUrl)) {
            $.getJSON(timelineUrl, function(timeline) {
                if (isValidTimelineFalseTrue(timeline)) {
                    var cursorUrl;
                    var cursor = timeline.cursors[0]; //sequencesと同様にcursorsも配列だが、先頭のみ対応
                    var cursorEndpointUrl = getCursorEndpointUrlFromCursor(cursor);
                    if (cursorEndpointUrl) {
                        var cursorIndex = cursorInfo.index;
                        var cursorFirst = getCursorIndexFromProp(cursor.first);
                        var cursorLast = getCursorIndexFromProp(cursor.last);
                        var cursorStep = getCursorIndexFromProp(cursor.step);
                        if (cursorIndex === null) {
                            var cursorDefalut = getCursorIndexFromProp(cursor.default);
                            if (cursorDefalut !== null) {
                                cursorIndex = cursorDefalut;
                            } else if (cursorFirst !== null) {
                                cursorIndex = cursorFirst;
                            } else if (cursorLast !== null) {
                                cursorIndex = cursorLast;
                            }
                        } else {
                            if (cursorFirst !== null && cursorIndex < cursorFirst) {
                                cursorIndex = cursorFirst;
                            } else if (cursorLast !== null && cursorIndex > cursorLast) {
                                cursorIndex = cursorLast;
                            }
                        }
                        cursorUrl = getCursorUrl(cursorEndpointUrl, cursorIndex);

                        cursorInfo.endpointUrl = cursorEndpointUrl;
                        cursorInfo.index = cursorIndex;
                        cursorInfo.first = cursorFirst;
                        cursorInfo.last = cursorLast;
                        if (cursorStep > 0) {
                            cursorInfo.step = cursorStep;
                        }
                        if (cursor.status) {
                            cursorInfo.status = cursor.status;
                        }
                    }
                    if (cursorUrl) {
                        processCursorUrl(cursorUrl, { timeline: timeline, timelineUrl: timelineUrl });
                    } else {
                        err = new Error(); showError(ICV_ERROR.INCORRECT_DATA, err.lineNumber); //プロパティ記載異常
                    }
                } else {
                    err = new Error(); showError(ICV_ERROR.INCORRECT_DATA, err.lineNumber); //json異常（invalidもしくは対応外の内容）(timeline)
                }
            }).fail(function(jqxhr, textStatus, error) {
                err = new Error(); showError(ICV_ERROR.DOWNLOAD_FAIL, err.lineNumber, textStatus + ', ' + error); //jsonの取得に失敗(timeline)
            });
        } else {
            err = new Error(); showError(ICV_ERROR.DOWNLOAD_FAIL, err.lineNumber); //表示が認められないURL(timeline)
        }
    }

    //cursorの取得 → processManifestsで内容処理
    function processCursorUrl(cursorUrl, options) {
        if ($.isPlainObject(options)) {
            if (options.timeline) {
                processCursorUrl.timeline = options.timeline;
            }
            if (options.timelineUrl) {
                processCursorUrl.timelineUrl = options.timelineUrl;
            }
        }
        $.getJSON(cursorUrl, function(cursor) {
            if (isValidCursorFalseTrue(cursor)) {
                var timelineUrl;
                if (cursor.within && $.type(cursor.within) === 'string') {
                    timelineUrl = cursor.within;
                } else {
                    timelineUrl = processCursorUrl.timelineUrl || cursorUrl;
                }
                var bookParam = {
                    manifestUrl : timelineUrl,
                    pageRanges  : [{ from: 1, to: -1 }],
                    isFiltered  : false
                };
                if (processCursorUrl.timeline) {
                    if ($.isArray(processCursorUrl.timeline.sequences)) {
                        processCursorUrl.timeline.sequences[0] = cursor.sequence;
                    } else {
                        processCursorUrl.timeline.sequences = [cursor.sequence];
                    }
                }

                cursorInfo.endpointUrl = getCursorEndpointUrlFromCursor(cursor);
                cursorInfo.index = getCursorIndexFromCursorUrl(cursorUrl);
                cursorInfo.prev = getCursorIndexFromProp(cursor.prev);
                cursorInfo.next = getCursorIndexFromProp(cursor.next);

                var optPage;
                if ($.isPlainObject(options) && options.refCanvasId && options.direction) {
                    //移動前のCursorと移動後のCursorに範囲重複がないか確認する。
                    //refCanvasId：基準となるCanvasのid
                    //direction：基準となるCanvasからの移動方向（'next'または'prev'）
                    for (var i = 0; i < cursor.sequence.canvases.length; i++) {
                        if (cursor.sequence.canvases[i]['@id'] === options.refCanvasId) {
                            var page_ = i; //基準となるCanvasの位置
                            if (options.direction === 'next') {
                                page_ = page + pageStep;
                            } else if (options.direction === 'prev') {
                                page_ = page - pageStep;
                            } else {
                                break;
                            }
                            if (page_ >= 0 || page_ < cursor.sequence.canvases.length) {
                                optPage = page_;
                            }
                            break;
                        }
                    }
                }
                if (optPage === undefined) {
                    //Cursorの初読み込み時、または移動前後のCursorに範囲重複がないとき
                    if ($.isPlainObject(options) && options.outRange !== undefined) {
                        optPage = options.outRange;
                    }
                }
                if ($.isPlainObject(options) && options.resetInfos === true) {
                    bookInfos = [];
                    pageInfos = [];
                }
                processManifests([processCursorUrl.timeline], [timelineUrl], [bookParam], optPage);
            } else {
                err = new Error(); showError(ICV_ERROR.INCORRECT_DATA, err.lineNumber); //json異常（invalidもしくは対応外の内容）(cursor)
            }
        }).fail(function(jqxhr, textStatus, error) {
            err = new Error(); showError(ICV_ERROR.DOWNLOAD_FAIL, err.lineNumber, textStatus + ', ' + error); //jsonの取得に失敗(cursor)
        });
    }

    //---------- manifest関係 ----------
    //manifestパラメータまたはドラッグ＆ドロップされたmanifestの取得 → processManifestsで内容処理
    //canvasUrl（省略可）：最初に表示するキャンバスのURL（省略時はGET引数のpageパラメータが利用される）
    function processManifestUrl(manifestUrl, canvasUrl, options) {
        function processManifestUrlCore(manifestUrl, canvasUrl, manifest) {
            if (iiifConverter && getManifestVersion(manifest) > 2) {
                manifest = iiifConverter.convertManifest(manifest);
            }
            if (isValidManifestFalseTrue(manifest)) {
                var bookParam = {
                    manifestUrl : manifestUrl,
                    canvasUrl   : canvasUrl,
                    pageRanges  : [{ from: 1, to: -1 }],
                    isFiltered  : false
                };
                processManifests([manifest], [manifestUrl], [bookParam]);
            } else {
                var code = checkManifestData(manifest);
                err = new Error(); showError(code, err.lineNumber); //json異常（invalidもしくは対応外の内容）(manifest)
            }
        }
        showLoadingMessage();
        if (isTrustedManifestUrl(manifestUrl)) {
            if ($.isPlainObject(options) && options.data) {
                processManifestUrlCore(manifestUrl, canvasUrl, options.data);
            } else {
                $.getJSON(manifestUrl, function(manifest) {
                    processManifestUrlCore(manifestUrl, canvasUrl, manifest);
                }).fail(function(jqxhr, textStatus, error) {
                    err = new Error(); showError(ICV_ERROR.DOWNLOAD_FAIL, err.lineNumber, textStatus + ', ' + error); //jsonの取得に失敗(manifest)
                });
            }
        } else {
            err = new Error(); showError(ICV_ERROR.DOWNLOAD_FAIL, err.lineNumber); //表示が認められないURL(manifest)
        }
    }

    //pagesパラメータまたはcuration.json内で指定されたmanifest(s)の取得 → processManifestsで内容処理
    function preprocessManifests(bookParams) {
        showLoadingMessage();
        var i;
        var manifestUrls = [];
        for (i = 0; i < bookParams.length; i++) {
            if ($.inArray(bookParams[i].manifestUrl, manifestUrls) === -1) {
                manifestUrls.push(bookParams[i].manifestUrl);
            }
        }
        var deferreds = [];
        for (i = 0; i < manifestUrls.length; i++) {
            deferreds.push($.getJSON(manifestUrls[i]));
        }
        $.when.apply($, deferreds).done(function() {
            //全てのmanifest.json取得に成功してから
            var manifests = [];
            if (deferreds.length === 1 && arguments[1] === 'success') {
                manifests.push(arguments[0]);
            } else {
                for (i = 0; i < deferreds.length; i++) {
                    if (arguments[i][1] === 'success') {
                        manifests.push(arguments[i][0]);
                    }
                }
            }
            if (deferreds.length === manifests.length) {
                processManifests(manifests, manifestUrls, bookParams);
            } else {
                err = new Error(); showError(ICV_ERROR.DOWNLOAD_FAIL, err.lineNumber); //jsonの取得時に'success'でないものがある(manifest)
            }
        }).fail(function(jqxhr, textStatus, error) {
            err = new Error(); showError(ICV_ERROR.DOWNLOAD_FAIL, err.lineNumber, textStatus + ', ' + error); //jsonの取得に失敗(manifests)
        });
    }

    //manifest(s)の内容処理
    function processManifests(manifests, manifestUrls, bookParams, optPage) {
        function getCanvasSummary(canvas) {
            var imageApiVersion = '0.0';
            var imageComplianceLevel = -1;
            var imageInfoUrl;
            var service = canvas.images[0].resource.service;
            if (service) {
                //The service must have the @context, @id and profile keys
                //https://iiif.io/api/annex/services/#image-information

                //Image API Version
                imageApiVersion = getImageApiVersion(service);
                //Image API Compliance Level
                imageComplianceLevel = getImageComplianceLevel(service);
                //service base URI
                imageInfoUrl = getImageInfoUrl(service);
            }

            //サムネイル
            var thumbnail;
            if ($.type(canvas.thumbnail) === 'string') {
                thumbnail = canvas.thumbnail;
            } else if ($.isPlainObject(canvas.thumbnail) && canvas.thumbnail['@id']) {
                thumbnail = canvas.thumbnail['@id'];
            }

            //Canvasオブジェクトの抜粋
            var canvasSummary = {
                id: canvas['@id'],
                label: canvas.label,
                metadata: canvas.metadata,
                description: canvas.description,
                imageInfoUrl: imageInfoUrl,
                cursorIndex: getCursorIndexFromCanvas(canvas),
                imageApiVersion: imageApiVersion,
                imageComplianceLevel: imageComplianceLevel, //IIIF Image API非対応リソースの場合は-1
                imageResourceId: canvas.images[0].resource['@id'], //Compliance Levelの低いサイトで画像全体を取得するために利用
                thumbnail: thumbnail,
                height: (typeof canvas.height === 'number') ? canvas.height : void 0,
                width: (typeof canvas.width === 'number') ? canvas.width : void 0
            };
            return canvasSummary;
        }
        var i, j, k;
        for (i = 0; i < manifests.length; i++) {
            var manifest = manifests[i];
            if (iiifConverter && getManifestVersion(manifest) > 2) {
                manifest = iiifConverter.convertManifest(manifest);
            }
            if (isValidManifestFalseTrue(manifest) || isValidTimelineFalseTrue(manifest)) {
                //処理途中の仮表示
                var text = $('#book_title').text() + ' ' + getPropertyValueI18n(manifest.label);
                document.title = text;
                $('#book_title').text(text);

                try {
                    var canvasesSummary = [];
                    for (j = 0; j < manifest.sequences[0].canvases.length; j++) {
                        var summary = getCanvasSummary(manifest.sequences[0].canvases[j]);
                        if (summary) {
                            canvasesSummary.push(summary);
                        }
                    }
                    var bookInfo = {
                        manifestUrl     : getAbsoluteUrl(manifestUrls[i]),
                        manifest        : manifest,
                        canvases        : canvasesSummary,
                        totalPagesNum   : canvasesSummary.length
                    };
                    bookInfos.push(bookInfo);
                } catch (e) {
                    //
                }
            }
        }
        manifestUrls = [];
        for (i = 0; i < bookInfos.length; i++) {
            manifestUrls.push(bookInfos[i].manifestUrl);
        }
        isFilteredContents = false;
        for (i = 0; i < bookParams.length; i++) {
            var bookParam = bookParams[i];
            bookParam.manifestUrl = getAbsoluteUrl(bookParam.manifestUrl);
            var bookIndex = $.inArray(bookParam.manifestUrl, manifestUrls);
            if (bookIndex > -1) {
                if (bookInfos[bookIndex].totalPagesNum > 0) {
                    var pageInfo = {};
                    var pageInfosLocal = [];
                    if (bookParam.pageRanges) {
                        //pagesパラメータで表示範囲が指定されている場合
                        for (j = 0; j < bookParam.pageRanges.length; j++) {
                            var pageRange = bookParam.pageRanges[j];
                            var startPage = pageRange.from; //1-based（ただし負数も許容）
                            var endPage = pageRange.to; //1-based（ただし負数も許容）
                            var totalPagesNum = bookInfos[bookIndex].totalPagesNum;
                            //負数は最後のページを基準とする位置（e.g. -1は最終ページ）
                            if (startPage < 0) {
                                startPage = startPage + totalPagesNum + 1;
                            }
                            if (startPage < 1 || startPage > totalPagesNum) {
                                startPage = 1;
                            }
                            if (endPage < 0) {
                                endPage = endPage + totalPagesNum + 1;
                            }
                            if (endPage < 1 || endPage > totalPagesNum) {
                                endPage = totalPagesNum;
                            }
                            if (startPage <= endPage) {
                                //正順
                                for (k = startPage; k <= endPage; k++) {
                                    pageInfo = {
                                        bookIndex : bookIndex,
                                        pageLocal : k //1-based
                                    };
                                    pageInfosLocal.push(pageInfo);
                                }
                            } else {
                                //逆順
                                for (k = startPage; k >= endPage; k--) {
                                    pageInfo = {
                                        bookIndex : bookIndex,
                                        pageLocal : k //1-based
                                    };
                                    pageInfosLocal.push(pageInfo);
                                }
                            }
                        }
                    } else if (bookParam.canvasIds) {
                        //curation.json内の"selections"で表示範囲が指定されている場合
                        for (j = 0; j < bookParam.canvasIds.length; j++) {
                            var canvasIdElems = bookParam.canvasIds[j].split('#');
                            var idx = $.inArray(canvasIdElems[0], getCanvasIds(bookIndex));
                            var fragment = void 0; //undefined
                            if (canvasIdElems.length > 1) {
                                fragment = canvasIdElems[1];
                            }
                            if (idx > -1) {
                                pageInfo = {
                                    bookIndex : bookIndex,
                                    pageLocal : idx + 1, //1-based（元資料でのページ番号）
                                    fragment  : fragment
                                };
                                pageInfosLocal.push(pageInfo);
                            }
                        }
                    }
                    if (bookParam.annotations) {
                        for (j = 0; j < bookParam.annotations.length; j++) {
                            var annotation = bookParam.annotations[j];
                            var canvasId;
                            if ($.isPlainObject(annotation.on) && $.type(annotation.on['@id']) === 'string') {
                                canvasId = annotation.on['@id'];
                            } else if ($.type(annotation.on) === 'string') {
                                canvasId = annotation.on;
                            }
                            var canvasIdElems_ = canvasId.split('#');
                            var idx_ = $.inArray(canvasIdElems_[0], getCanvasIds(bookIndex));
                            var fragment_ = void 0; //undefined
                            if (canvasIdElems_.length > 1) {
                                fragment_ = canvasIdElems_[1];
                            }
                            if (idx_ > -1) {
                                if (bookInfos[bookIndex].canvases[idx_].annotations === void 0) {
                                    bookInfos[bookIndex].canvases[idx_].annotations = [];
                                }
                                var annot = {
                                    '@id'     : annotation['@id'],
                                    '@type'   : annotation['@type'],
                                    motivation: annotation.motivation,
                                    resource  : annotation.resource,
                                    on        : canvasId,
                                    fragment  : fragment_
                                };
                                bookInfos[bookIndex].canvases[idx_].annotations.push(annot);
                            }
                        }
                    }
                    if (pageInfosLocal.length > 0) {
                        pageInfos = pageInfos.concat(pageInfosLocal);
                        isFilteredContents = isFilteredContents || bookParam.isFiltered;
                    }
                }
            }
        }
        if (pageInfos.length === 0) {
            err = new Error(); showError(ICV_ERROR.INCORRECT_DATA, err.lineNumber); //データ異常（表示すべきコマがない（見つけられない））
            return;
        }
        //資料ナビのために、資料が切り替わる場所(page)を求めておく
        bookChangePages = [];
        var bookIndexPrev = -1;
        for (i = 0; i < pageInfos.length; i++) {
            var bookIndex_ = pageInfos[i].bookIndex;
            if (bookIndex_ !== bookIndexPrev) {
                bookChangePages.push(i); //0-based
            }
            bookIndexPrev = bookIndex_;
        }
        //curationパラメータで指定された外部キュレーションを表示するときは、編集用にsessionStorageへ格納する
        if (getBrowsingCurationUrl()) {
            var externalFavData = getBrowsingCurationFavs();
            setFavs(externalFavData, true); //キュレーション対象のcanvasとURLが格納される
            if (storageSession) {
                //上書きエクスポート時にも、キュレーションのlabel等（selections以外）を維持するため、元の値を格納しておく
                var browsingCurationJson = JSON.parse(JSON.stringify(getBrowsingCurationJson()));
                browsingCurationJson.selections = []; //キュレーションリスト画面の内容で差し替えるので保存不要
                try {
                    storageSession.setItem('curationJson', JSON.stringify(browsingCurationJson));
                } catch (e) {
                    enableCurationEdit = false;
                    err = new Error(); showError(ICV_ERROR.WEB_STORAGE, err.lineNumber, e);
                }
            }
        }

        //左右矢印キーのイベントは、Leaflet側では処理しない
        L.Map.Keyboard.prototype.keyCodes.left = [];
        L.Map.Keyboard.prototype.keyCodes.right = [];

        //最初に表示するページ
        page = 0; //ページ指定がないときは、表示対象指定範囲の先頭ページを表示する。
        if ((optPage || optPage === 0) && /^(-?[0-9]+)$/.test(String(optPage))) {
            page = parseInt(String(optPage), 10);
            if (page < 0) {
                page = pageInfos.length + page;
            }
        } else {
            var match = location.search.match(/pos=([0-9]+?)(?:&|$)/);
            if (match) {
                page = parseInt(match[1], 10) - 1; //1-based to 0-based
            }
        }
        if (page < 0 || page > pageInfos.length - 1) {
            page = 0;
        }
        if (bookParams.length === 1 && bookParams[0].canvasUrl) {
            //単一のmanifestが指定された場合に限り、canvasUrlによって、最初に表示するページを
            //指定できるものとする。（Curationでは、同一キャンバスが複数回含まれることを
            //許容しており、canvasUrlだけでは、何ページ目を選択するべきか定まらないため。）
            var canvasUrl_ = bookParams[0].canvasUrl.replace(/^https:/, 'http:');
            for (i = 0; i < pageInfos.length; i++) {
                if (String(getCanvasId(i)).replace(/^https:/, 'http:') === canvasUrl_) {
                    page = i;
                    break;
                }
            }
        }

        //ナビゲーションUI表示
        $('#page_navigation').show();
        //移動量設定ナビの非表示
        var steps = isTimelineMode ? conf.timeline.steps : conf.manifest.steps;
        if ($.isArray(steps) && steps.length > 0 && !isFilteredContents) {
            $('#step_nav').show();
            $('#increase_step').attr('title', (lng !== 'ja') ? 'Increase Step' : 'コマ移動量を増やす');
            $('#decrease_step').attr('title', (lng !== 'ja') ? 'Decrease Step' : 'コマ移動量を減らす');
        } else {
            $('#step_nav').hide();
        }
        //日付入力の非表示
        if (isTimelineMode && !isFilteredContents && $.fn.datepicker) {
            $('#cursor_date').off('.processManifests');
            $('#cursor_date').datepicker({
                autoclose: true,
                language: lng
            }).on('changeDate.processManifests', function() {
                var cursorDate = $(this).datepicker('getDate');  //localized date object
                var unixTime = Math.round(cursorDate.getTime() / 1000); //universal time
                var cursorUrl = getCursorUrl(cursorInfo.endpointUrl, unixTime);
                if (cursorUrl && cursorInfo.index !== unixTime) {
                    cursorInfo.index = unixTime;
                    processCursorUrl(cursorUrl, { outRange: 0, resetInfos: true }); //pos指定をリセット
                }
            }).attr('title', (lng !== 'ja') ? 'Calender' : '日付指定');
            if (cursorInfo.first !== null) {
                var startDate = new Date(cursorInfo.first * 1000);
                $('#cursor_date').datepicker('setStartDate', startDate);
            }
            if (cursorInfo.last !== null) {
                var endDate = new Date(cursorInfo.last * 1000);
                $('#cursor_date').datepicker('setEndDate', endDate);
            }
        } else {
            $('#cursor_date').hide();
        }
        //最新画像に移動の非表示
        if (isTimelineMode && !isFilteredContents && cursorInfo.status === 'updating') {
            $('#timeline_latest').attr('title', (lng !== 'ja') ? 'Move to the latest' : '最新画像に移動');
        } else {
            $('#timeline_latest').hide();
        }
        //元資料の並び順で閲覧するリンクの非表示
        if (!isFilteredContents) {
            $('#page_orig_nav').hide();
        }
        //資料ナビの非表示
        if (bookChangePages.length === 1) {
            $('#books_nav').hide();
        }
        //情報表示
        $('.dropdown-menu-custom').off('.processManifests');
        $('.dropdown-menu-custom').on('click.processManifests', function(e) {
            e.stopPropagation();
        });
        //ヘルプ
        $('#help_nav').attr('title', (lng !== 'ja') ? 'Help' : 'ヘルプ');
        $('#help_title').text(APP_NAME + ' v' + VERSION);
        $('#help_contents').html(getHelp());
        var aboutUrl = getPropertyValuesI18n(conf.doc.aboutUrl)[0];
        if (aboutUrl) {
            $('#help_more').attr('href', aboutUrl).text((lng !== 'ja') ? ('About ' + APP_NAME) : (APP_NAME + 'について'));
        } else {
            $('#help_more').hide();
        }
        //キュレーションリスト作成ナビ
        $('#show_curation_list').attr('title', (lng !== 'ja') ? 'Show the curation list' : 'キュレーションリストを表示');
        if (!enableCurationEdit) {
            $('#curation_nav').hide();
        }
        //キュレーションリスト画面
        $('#curation_list_title').text((lng !== 'ja') ? 'Curation list' : 'キュレーションリスト');
        $('#curation_list_clear').html('<span class="glyphicon glyphicon-remove"></span> ' + ((lng !== 'ja') ? 'Clear All' : '全てクリア'))
            .attr('title', (lng !== 'ja') ? 'Clear this list' : 'キュレーションリストをクリア');
        $('#curation_list_export').html('<span class="glyphicon glyphicon-export"></span> ' + ((lng !== 'ja') ? 'Export' : 'エクスポート'))
            .attr('title', (lng !== 'ja') ? 'Export this list' : 'キュレーションリストをエクスポート');
        $('#curation_list_json').attr('title', (lng !== 'ja') ? 'Download this list as a JSON file' : 'JSONファイルとしてダウンロード');
        //キュレーションリスト作成関係イベント登録
        setupCurationListEvents();
        //モーダルの閉じるボタン
        $('[data-dismiss="modal"]').text((lng !== 'ja') ? 'Close' : '閉じる');
        //モーダル
        $('.modal').off('.processManifests');
        $('.modal').on('show.bs.modal.processManifests', function(e) {
            if ($(this).data('bs.modal').isShown || e.isDefaultPrevented()) {
                //https://github.com/twbs/bootstrap/blob/v3.3.7/js/modal.js#L57
                return; //show.bs.modalイベントは発生したが、後にshown.bs.modalイベントは発生しない
            }
            inModalTransitions += 1;
        });
        $('.modal').on('hide.bs.modal.processManifests', function(e) {
            if (!$(this).data('bs.modal').isShown || e.isDefaultPrevented()) {
                //https://github.com/twbs/bootstrap/blob/v3.3.7/js/modal.js#L116
                return; //hide.bs.modalイベントは発生したが、後にhidden.bs.modalイベントは発生しない
            }
            inModalTransitions += 1;
        });
        $('.modal').on('shown.bs.modal.processManifests hidden.bs.modal.processManifests', function() {
            inModalTransitions -= 1;
        });

        refreshPage(); //ページ画像を表示

        //キーボードショートカット
        $(document.body).off('.processManifests');
        $(document.body).on('keydown.processManifests', function(event) {
            if (map === undefined) { return; }
            if (event.ctrlKey) { return; }
            var ArrowLeft = 37;
            var ArrowRight = 39;
            if (event.keyCode === ArrowLeft || event.keyCode === ArrowRight) { //left, right
                //サムネイル一覧を表示中は、サムネイル一覧の前／次ページ移動
                if (isThumbnailsHidden()) {
                    var viewingDirection;
                    if ('curation' in params) {
                        //キュレーション表示中は、構成要素のmanifestの設定によらず移動方向は固定
                        viewingDirection = 'left-to-right';
                    } else {
                        //manifest表示中は、viewingDirectionの設定に応じて移動方向を変更
                        viewingDirection = getManifestViewingDirection(page);
                    }
                    if (viewingDirection === 'right-to-left') {
                        if (event.keyCode === ArrowLeft) {
                            onNextPage();
                        } else if (event.keyCode === ArrowRight) {
                            onPrevPage();
                        }
                    } else {
                        if (event.keyCode === ArrowLeft) {
                            onPrevPage();
                        } else if (event.keyCode === ArrowRight) {
                            onNextPage();
                        }
                    }
                }
            } else if (event.keyCode === 8) { //backspace
                if (isThumbnailsHidden()) {
                    //閲覧対象内で前のコマに移動
                    onPrevPage();
                }
            } else if (event.keyCode === 32) { //space
                if (isThumbnailsHidden()) {
                    //閲覧対象内で次のコマに移動
                    onNextPage();
                }
            } else if (event.keyCode === 70) { //f(ullscreen)
                //フルスクリーン表示トグル
                toggleFullscreen();
            } else if (event.keyCode === 84) { //t(humbnail)
                //サムネイル一覧トグル
                if (inModalTransitions < 1) {
                    toggleThumbnails();
                }
            } else if (event.keyCode === 67) { //c(uration list)
                //キュレーションリスト表示トグル
                if (inModalTransitions < 1 && enableCurationEdit) {
                    toggleCurationList();
                }
            } else if (event.keyCode === 76) { //l(ike)
                //キュレーションリスト登録切り替え
                if (isCurationListHidden() && enableCurationEdit) {
                    toggleFav();
                }
            } else if (event.keyCode === 107) { //+ (Numpad)
                map.zoomIn();
            } else if (event.keyCode === 109) { //- (Numpad)
                map.zoomOut();
            }
        });

        //サムネイル一覧
        var tnList = '';
        for (i = 0; i < pageInfos.length; i++) {
            j = i + 1;
            var tnUrl = getThumbnailUrl(i);
            var bookIndexTn = pageInfos[i].bookIndex;
            var imageTitle = getPropertyValueI18n(bookInfos[bookIndexTn].manifest.label) + '/' + pageInfos[i].pageLocal; //manifest.labelはuncleanの可能性あり
            // the preload image embedded below has taken form 'jPages' released under the MIT license, Copyright (c) 2011 by Luís Almeida.
            var preloadImageData = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAH4AAAB+CAIAAABtQTLfAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAALiSURBVHhe7d27cuowGEVh3v8F3bmjc0VFR2zLFr98CR7GYmXCosokkvbh80YS1bk0viCBC5RrbCM9VgLppccEsGBbLz0mgAXbeukxASzY1kuPCWDBtl56TAALtvXSYwJYsK2XHhPAgm299JgAFmzrpccEsGBbLz0mgAXbeukxASzY1kuPCWDBtl56TAALtvXSYwJYsK2XHhPAgm299JgAFmzrpccEsGBbLz0mgAXbeukxASzY1kuPCWDBtl56TAALtvXSYwJYsK2XHhPAgm299JgAFmzrpccEsGBbLz0mgAXbeukxASz4M61vu/vj3rUnv8vr7fG4XftF6yx/8r92tdy/oK+NVGd96eu4HlgVpx82i+k1bh7TK/y6/2vYrIZdZnzdu2614aSd57q5ZJg4DIhhB5wqDGHpR+AJIf6cd/HhHYc/DL+fH0OiLPf69MDmEa8nVgA9viRKXwg3zfPYbIsTOZ+i5finbB4QH188fvcmHneqMJKmj/eexUUl7xBpe2lXF5lh/Lr1YcV5weUNKE+sAHp8yb9Jn9TjxiH98WdajNy5eMetux+ft4X+h/hpyMN2N6j5a8MiZ2enega9+XbOmYa2Pp6ge6fpdNVJj2L8NEzH8t4xu7HhpIkb5/M5hm+u8jn6+QqZ74bpKN2+XIZ9vheLbT9wucxndPEh2Jq4+9GMM2t9V/4M/Zu9qDVtsaHVinmx7nfQF4fK4gYKwTdf83+VFN+O+W+yw/P+jtZjzf4tWHrssUgvPSaABdt66TEBLNjWS48JYMG2XnpMAAu29dJjAliwrZceE8CCbb30mAAWbOulxwSwYFsvPSaABdt66TEBLNjWS48JYMG2XnpMAAu29dJjAliwrZceE8CCbb30mAAWbOulxwSwYFsvPSaABdt66TEBLNjWS48JYMG2XnpMAAu29dJjAliwrZceE8CCbb30mAAWbOulxwSwYFsvPSaABdt66TEBLNjWY/Q/NwKdVKPqVCYAAAAASUVORK5CYII=';
            var img = null;
            var $image = $('<img>').attr({ src: preloadImageData, alt: imageTitle, title: imageTitle, 'data-original': tnUrl });
            if (getCanvasImageInfoUrl(i)) {
                img = $image.prop('outerHTML');
            } else {
                //IIIF Image API非対応リソース
                img = getPsuedoIIIFThumbnail($image, i).prop('outerHTML');
            }
            var anchor = '<a href="javascript:iiifViewer.gotoPage(' + j + ');" class="thumbnail">' + img + '</a>'; //gotoPage()は1-based
            var label;
            if (isTimelineMode) {
                var canvasLabel = getPropertyValueI18nAsHtml(getCanvasLabel(i), { allowMinimalHtmlTag: false });
                label = '<span class="thumbnail_label">' + canvasLabel + '</span>';
            } else {
                label = '<span class="thumbnail_label">' + j + '</span>'; //1-based
            }
            tnList += '<li><div style="text-align: center;">' + anchor + label + '</div></li>';
        }
        $('#thumbnails_container').html(tnList);
        $('#thumbnails_nav').html('');

        //負荷軽減のため遅延表示
        $('ul li img').lazyload({
            event  : 'turnPage',
            effect : 'show'
        });

        $('#thumbnails_win').off('.processManifests_thumbnails');
        $('#thumbnails_win').on('shown.bs.modal.processManifests_thumbnails', function(/*event*/) {
            //可視状態になってからjPagesの設定を行わないと正しく動作しないため
            var THUMBNAILS_NUM_PER_PAGE = 20;
            var thumbnailsPage = Math.floor(page / THUMBNAILS_NUM_PER_PAGE) + 1;
            if ($('#thumbnails_nav').html() === '') {
                $('#thumbnails_nav').jPages({
                    containerID : 'thumbnails_container',
                    previous    : '«',
                    next        : '»',
                    animation   : '',
                    fallback    : 1,
                    delay       : 0,
                    perPage     : THUMBNAILS_NUM_PER_PAGE,
                    startPage   : thumbnailsPage,
                    keyBrowse   : true,
                    callback    : function(pages, items) {
                        items.showing.find('img').trigger('turnPage');
                        items.oncoming.find('img').trigger('turnPage');
                        $('#thumbnails_container li a').eq(page).focus();
                    }
                });
            } else {
                $('#thumbnails_nav').jPages(thumbnailsPage);
                $('#thumbnails_container li a').eq(page).focus();
            }
        });

        function getObjectToShowDescription() {
            if (getBrowsingCurationUrl()) {
                //curation表示時
                //キュレーションの表示が指定されているときに、キュレーションにdescriptionがなければ、
                //マニフェストのdescription表示は試みない
                if (getBrowsingCurationJson().description) {
                    //キュレーションdescription表示
                    return getBrowsingCurationJson();
                }
            } else {
                var bookIndexCurrent = pageInfos[page].bookIndex;
                if (bookInfos[bookIndexCurrent].manifest.description) {
                    //マニフェストdescription表示
                    showDescription(bookInfos[bookIndexCurrent].manifest);
                    return bookInfos[bookIndexCurrent].manifest;
                }
            }
            return null;
        }

        //GET引数等によるその他のオプション動作（表示状態指定）
        /* 優先度の考え方：
            conf.showOnLoaded.description は、展示用途などで個別に設置されたビューワにおいて設定され、
            最初にdescriptionを読んで欲しいといった目的に利用することを想定している。

            このため、この意図と干渉するGET引数の指定がなされた場合であっても、そのビューワ設置においては、
            設置意図を優先することとする。

            すなわち、conf.showOnLoaded.descriptionが設定されている場合、表示すべきdescriptionが
            あるにも関わらず、それを表示しないようにするGET引数指定は効力を発しないものとする。

            conf.showOnLoaded.descriptionとGET引数が同時に設定されている場合であって、
            表示すべきdescriptionがない場合は、GET引数の指定が効力を発する。

            GET引数によるオプション指定の優先度は、以下の順とする。
                description表示＞サムネイル一覧表示＞フルスクリーン表示

            description表示とサムネイル一覧表示等が同時に指定された場合であって、
            表示すべきdescriptionがない場合は、サムネイル一覧表示等の指定が効力を発する。
        */
        var showDescription_ = false;
        if (conf.showOnLoaded.description || ('description' in params && params.description === '1')) { //description表示指定
            var objectToShowDescription = getObjectToShowDescription();
            if (objectToShowDescription) {
                showDescription_ = true;
                showDescription(objectToShowDescription);
            }
        }
        if (!showDescription_) {
            //description表示指定がないとき、または、description表示指定があってもdescription記載がなかったとき
            if ('tn' in params) { //thumbnails
                if (params.tn === '1') {
                    showThumbnails();
                }
            } else if ('full' in params) { //fullscreen
                //フルスクリーン状態でサムネイル一覧は表示できないため、else ifとする。
                if (params.full === '1') {
                    toggleFullscreen();
                }
            }
        }
    }

    //----------------------------------------------------------------------
    function refreshPage() {
        setupNavigations();

        var zoom;
        var center;
        var fitBounds;
        var isFullscreenMode = false;
        var toolbarNextPrev;
        var TILE_SIZE_PREFERRED = 1024;
        var TILE_SIZE_DEFAULT = 256;
        var MASK_LAYER_NAME = 'fragment';
        var ANNOTATION_LAYER_NAME = 'annotations';
        var isFirstTime;
        var textMarkerExist = false;
        var iconMarkerExist = false;
        var width = getCanvasWidth(page);
        var tileSize = (width >= TILE_SIZE_PREFERRED) ? TILE_SIZE_PREFERRED : TILE_SIZE_DEFAULT;
        if (width < tileSize && width > 0) {
            tileSize = width;
        }
        if (map === undefined) {
            center = [0, 0];
            zoom = 0;
            fitBounds = false; //true;
            isFirstTime = true;
        } else {
            center = map.getCenter();
            zoom = map.getZoom();
            fitBounds = false;
            isFullscreenMode = isFullscreen();
            map.eachLayer(function(layer) {
                if (layer.options && layer.options.name === MASK_LAYER_NAME) {
                    center = [0, 0];
                    zoom = 0;
                    fitBounds = true;
                }
            });
            if (tileSize > TILE_SIZE_DEFAULT) {
                map.spin(false);
            }
            map.remove();
        }
        //Chromeでは、ズームボタンを押下したときにmap全体が見えるようにスクロールする挙動へのworkaround
        //→ ズームインボタンに bootstrapの a:focusが適用されてしまう副作用があるためコメントアウト
        // L.Control.include({
        //     _refocusOnMap: L.Util.falseFn //https://github.com/Leaflet/Leaflet/issues/4125
        // });
        var fullscreenOptions = {
            pseudoFullscreen: true,
            title: {
                'false': (lng !== 'ja') ? 'View Fullscreen' : 'フルページ表示',
                'true' : (lng !== 'ja') ? 'Exit Fullscreen' : 'フルページ解除'
            }
        };
        var mapOptions = {
            crs: L.CRS.Simple,
            fullscreenControl: fullscreenOptions
        };
        map = L.map('image_canvas', mapOptions);
        var attribution = '';
        var manifest = getManifest(page);
        if (manifest.attribution) {
            attribution = getPropertyValueI18nAsHtml(manifest.attribution, { allowMinimalHtmlTag: true });
        }
        var iiif;
        if (getCanvasImageInfoUrl(page)) {
            iiif = L.tileLayer.iiif(getCanvasImageInfoUrl(page), {
                tileSize: getCanvasImageComplianceLevel(page) ? tileSize : void 0,
                fitBounds: fitBounds,
                attribution: attribution
            });
            iiif.hasImageAPIservice = true;
        } else {
            iiif = L.imageOverlayCustom(getCanvasImageResourceId(page), getCanvasWidth(page), getCanvasHeight(page), {
                fitBounds: fitBounds,
                attribution: attribution
            });
            iiif.hasImageAPIservice = false;
        }
        iiif.id = 'iiif';
        map.addLayer(iiif);
        map.setView(center, zoom);
        if (map.attributionControl) {
            map.attributionControl.setPrefix($('<a>').attr('href', APP_URL).text(APP_NAME).prop('outerHTML'));
        }
        if (tileSize > TILE_SIZE_DEFAULT) {
            var DELAY_TIME_TO_SHOW_SPIN = 200; //ms
            var isTileLoadDone = false;
            setTimeout(function() {
                if (isTileLoadDone === false) {
                    map.spin(true);
                }
            }, DELAY_TIME_TO_SHOW_SPIN); //読み込み済みページへの移動でも一瞬spinが表示されるのは見苦しいので遅延実行する
            iiif.on('load', function() {
                isTileLoadDone = true;
                map.spin(false);
            });
            iiif.on('tileerror', function() {
                isTileLoadDone = true;
                map.spin(false);
            });
            iiif.on('tileload', function() {
                isTileLoadDone = true;
                map.spin(false);
            });
        }
        var borderMarkerEditTargetId = null;
        iiif.on('load', function() {
            function getBoundsFromFragment(fragment) {
                var bounds;
                if (fragment) {
                    //https://www.w3.org/TR/media-frags/#naming-space
                    var match = fragment.match(/xywh=(?:pixel:)?([0-9]+),([0-9]+),([0-9]+),([0-9]+)/); //「percent:」は未対応
                    if (match) {
                        var x = parseInt(match[1], 10);
                        var y = parseInt(match[2], 10);
                        var w = parseInt(match[3], 10);
                        var h = parseInt(match[4], 10);

                        var minPoint = L.point(x, y);
                        var maxPoint = L.point(x + w, y + h);
                        var minLatLng = map.unproject(minPoint, iiif.maxNativeZoom);
                        var maxLatLng = map.unproject(maxPoint, iiif.maxNativeZoom);
                        bounds = L.latLngBounds(minLatLng, maxLatLng);
                    }
                }
                return bounds;
            }
            function getBoundsFull() {
                var minCanvasLatLng = L.latLng(0, 0);
                var maxCanvasPoint = L.point(iiif.x, iiif.y);
                var maxCanvasLatLng = map.unproject(maxCanvasPoint, iiif.maxNativeZoom);
                return L.latLngBounds(minCanvasLatLng, maxCanvasLatLng);
            }
            function setupLeafletCustomIcon() {
                //img要素のカスタムデータ属性で元のサイズを保持するように拡張したL.Icon
                L.Icon.IcvShadow = L.Icon.extend({});
                L.Icon.IcvShadow.include({
                    _setIconStyles: function (img, name) {
                        // Based on
                        // "L.Icon" (2-clause BSD License, Copyright (c) 2010-2013, Vladimir Agafonkin, Copyright (c) 2010-2011, CloudMade)
                        // https://github.com/Leaflet/Leaflet/blob/v0.7.7/src/layer/marker/Icon.js#L54-L80
                        var options = this.options,
                            size = L.point(options[name + 'Size']),
                            anchor;
                        if (name === 'shadow') {
                            anchor = L.point(options.shadowAnchor || options.iconAnchor);
                        } else {
                            anchor = L.point(options.iconAnchor);
                        }
                        if (!anchor && size) {
                            anchor = size.divideBy(2, true);
                        }
                        img.className = 'leaflet-marker-' + name + ' ' + options.className;

                        var zoom = options.zoom || 0;  //added
                        var scale = Math.pow(2, zoom); //added

                        if (anchor) {
                            img.style.marginLeft = (-anchor.x) + 'px';
                            img.style.marginTop  = (-anchor.y) + 'px';
                            if (img.dataset) {
                                img.dataset.marginLeft = -anchor.x / scale; //added
                                img.dataset.marginTop  = -anchor.y / scale; //added
                            }
                        }
                        if (size) {
                            img.style.width  = size.x + 'px';
                            img.style.height = size.y + 'px';
                            if (img.dataset) {
                                img.dataset.width  = size.x / scale; //added
                                img.dataset.height = size.y / scale; //added
                            }
                        }
                    }
                });
                //markerPaneではなくshadowPaneにアイコンを表示するように変更したL.Marker
                L.Marker.IcvShadow = L.Marker.extend({});
                L.Marker.IcvShadow.include({
                    _initIcon: function () {
                        // Based on
                        // "L.Marker" (2-clause BSD License, Copyright (c) 2010-2013, Vladimir Agafonkin, Copyright (c) 2010-2011, CloudMade)
                        // https://github.com/Leaflet/Leaflet/blob/v0.7.7/src/layer/marker/Marker.js#L106-L175
                        var options = this.options,
                            map = this._map,
                            animation = (map.options.zoomAnimation && map.options.markerZoomAnimation),
                            classToAdd = animation ? 'leaflet-zoom-animated' : 'leaflet-zoom-hide';

                        var icon = options.icon.createIcon(this._icon),
                            addIcon = false;

                        // if we're not reusing the icon, remove the old one and init new one
                        if (icon !== this._icon) {
                            if (this._icon) {
                                this._removeIcon();
                            }
                            addIcon = true;

                            if (options.title) {
                                icon.title = options.title;
                            }

                            if (options.alt) {
                                icon.alt = options.alt;
                            }
                        }

                        L.DomUtil.addClass(icon, classToAdd);

                        if (options.keyboard) {
                            icon.tabIndex = '0';
                        }

                        this._icon = icon;

                        this._initInteraction();

                        if (options.riseOnHover) {
                            L.DomEvent
                                .on(icon, 'mouseover', this._bringToFront, this)
                                .on(icon, 'mouseout', this._resetZIndex, this);
                        }

                        var newShadow = options.icon.createShadow(this._shadow),
                            addShadow = false;

                        if (newShadow !== this._shadow) {
                            this._removeShadow();
                            addShadow = true;
                        }

                        if (newShadow) {
                            L.DomUtil.addClass(newShadow, classToAdd);
                        }
                        this._shadow = newShadow;


                        if (options.opacity < 1) {
                            this._updateOpacity();
                        }


                        var panes = this._map._panes;

                        if (addIcon) {
                            panes.shadowPane.appendChild(this._icon); //modified
                        }

                        if (newShadow && addShadow) {
                            panes.shadowPane.appendChild(this._shadow);
                        }
                    }
                });
            }
            function makeZabutonSVG(width, height, colorHex) {
                return 'data:image/svg+xml;charset=utf8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%20' + width + '%20' + height + '%22%3E%3Crect%20x%3D%220%22%20y%3D%220%22%20width%3D%22' + width + '%22%20height%3D%22' + height + '%22%20fill%3D%22%23' + colorHex + '%22%2F%3E%3C%2Fsvg%3E';
            }
            if (iiif.x && iiif.y) {
                fixCanvasImageApiInformation(page, iiif);
                var bounds;
                var considerBoundsLater;
                if (getBrowsingCurationUrl()) {
                    //curation表示時
                    bounds = getBoundsFromFragment(pageInfos[page].fragment);
                    if (bounds) {
                        //半透明マスク表示
                        var boundsFull = getBoundsFull();
                        var polyCanvas = [boundsFull.getNorthWest(), boundsFull.getNorthEast(),
                            boundsFull.getSouthEast(), boundsFull.getSouthWest(), boundsFull.getNorthWest()];
                        var polyHole = [bounds.getNorthWest(), bounds.getNorthEast(),
                            bounds.getSouthEast(), bounds.getSouthWest(), bounds.getNorthWest()];
                        var polyOption = {
                            color: '#ddd',
                            weight: 1,
                            fill: true,
                            fillOpacity: 0.9,
                            name: MASK_LAYER_NAME
                        };
                        L.polygon([polyCanvas, polyHole], polyOption).addTo(map);
                    } else {
                        //キュレーション内で部分領域指定がなければ、
                        //最初にコマを表示したときに限り、GETパラメータによる初期ズーム領域を反映させる（未指定の場合は全体表示）
                        //（アノテーションビューモードの場合は、この段階では「未指定の場合は全体表示」とはせず、後ほど考慮する）
                        if (getMode() === 'annotation') {
                            //アノテーションビューモード
                            if (isFirstTime) {
                                isFirstTime = false;
                                bounds = getBoundsFromFragment('xywh=' + params.xywh);
                            }
                            if (!bounds) {
                                //・最初にコマを表示したときであって、GETパラメータによる初期ズーム領域が指定されていないとき
                                //・最初にコマを表示したのではないとき
                                //は、後ほどズーム領域を考慮する。
                                //（アノテーション表示追加後、アノテーション領域全体が含まれるようにズームする）
                                considerBoundsLater = true;
                            }
                        } else {
                            if (isFirstTime) {
                                isFirstTime = false;
                                bounds = getBoundsFromFragment('xywh=' + params.xywh) || getBoundsFull();
                            }
                        }
                    }
                } else {
                    //manifest/timeline表示時
                    //最初にコマを表示したときに限り、GETパラメータによる初期ズーム領域を反映させる（未指定の場合は全体表示）
                    if (isFirstTime) {
                        isFirstTime = false;
                        bounds = getBoundsFromFragment('xywh=' + params.xywh); //初期ズーム領域
                        if (bounds) {
                            if (params.xywh_highlight === 'border') {
                                //bounding box表示
                                var polyHole_ = [bounds.getNorthWest(), bounds.getNorthEast(),
                                    bounds.getSouthEast(), bounds.getSouthWest(), bounds.getNorthWest()];
                                var polyOption_ = {
                                    color: '#00BFFF',
                                    weight: 2,
                                    fillOpacity: 0,
                                };
                                L.rectangle(polyHole_, polyOption_).addTo(map);
                            }
                        } else {
                            //未指定の場合は全体表示
                            //ユーザ自身によるズームやパンを維持するため、最初にコマを表示したとき以外では適用してはならない
                            bounds = getBoundsFull();
                        }
                    }
                }
                if (bounds) {
                    //ズーム領域が設定されていればズームし、設定されていなければユーザ自身によるズームやパンを維持
                    map.fitBounds(bounds);
                }

                if (pageInfos.length > 1) {
                    $('#image_canvas_overlay_wrapper').show();
                    var $imageCanvasOverlayLeft = $('#image_canvas_overlay_left');
                    var $imageCanvasOverlayRight = $('#image_canvas_overlay_right');
                    //左右タップでページ移動
                    var viewingDirection = getManifestViewingDirection(page);
                    $imageCanvasOverlayLeft.off('.prevnext');
                    $imageCanvasOverlayRight.off('.prevnext');
                    if (viewingDirection === 'right-to-left') {
                        $imageCanvasOverlayLeft.on('click.prevnext', function() { onNextPage(); });
                        $imageCanvasOverlayRight.on('click.prevnext', function() { onPrevPage(); });
                        $imageCanvasOverlayLeft.attr('href', 'javascript:void("next");');
                        $imageCanvasOverlayRight.attr('href', 'javascript:void("prev");');
                    } else {
                        $imageCanvasOverlayLeft.on('click.prevnext', function() { onPrevPage(); });
                        $imageCanvasOverlayRight.on('click.prevnext', function() { onNextPage(); });
                        $imageCanvasOverlayLeft.attr('href', 'javascript:void("prev");');
                        $imageCanvasOverlayRight.attr('href', 'javascript:void("next");');
                    }
                    $imageCanvasOverlayLeft.on('dblclick.prevnext', function() { return false; });
                    $imageCanvasOverlayRight.on('dblclick.prevnext', function() { return false; });

                    if (lng !== 'ja') {
                        $imageCanvasOverlayLeft.html('<span aria-hidden="true" class="glyphicon glyphicon-chevron-left image_canvas_overlay_button_left"></span>');
                        $imageCanvasOverlayRight.html('<span aria-hidden="true" class="glyphicon glyphicon-chevron-right image_canvas_overlay_button_right"></span>');
                    } else {
                        if (viewingDirection === 'right-to-left') {
                            $imageCanvasOverlayLeft.html('<span aria-hidden="true" class="image_canvas_overlay_button_left">次</span>');
                            $imageCanvasOverlayRight.html('<span aria-hidden="true" class="image_canvas_overlay_button_right">前</span>');
                        } else {
                            $imageCanvasOverlayLeft.html('<span aria-hidden="true" class="image_canvas_overlay_button_left">前</span>');
                            $imageCanvasOverlayRight.html('<span aria-hidden="true" class="image_canvas_overlay_button_right">次</span>');
                        }
                    }

                    if ($imageCanvasOverlayLeft.is(':hidden')) {
                        $imageCanvasOverlayLeft.css({ opacity: 0.6 }).show();
                    }
                    if (!$imageCanvasOverlayLeft.is(':hover') || L.Browser.touch) {
                        $imageCanvasOverlayLeft.stop(true, false).fadeTo('normal', 0.01);
                    }
                    $imageCanvasOverlayLeft.on({
                        'mouseenter.prevnext touchstart.prevnext': function() {
                            $(this).stop(true, false).fadeTo('fast', 0.6);
                        },
                        'mouseleave.prevnext touchend.prevnext': function() {
                            $(this).stop(true, false).fadeTo('fast', 0.01);
                        }
                    });
                    if ($imageCanvasOverlayRight.is(':hidden')) {
                        $imageCanvasOverlayRight.css({ opacity: 0.6 }).show();
                    }
                    if (!$imageCanvasOverlayRight.is(':hover') || L.Browser.touch) {
                        $imageCanvasOverlayRight.stop(true, false).fadeTo('normal', 0.01);
                    }
                    $imageCanvasOverlayRight.on({
                        'mouseenter.prevnext touchstart.prevnext': function() {
                            $(this).stop(true, false).fadeTo('fast', 0.6);
                        },
                        'mouseleave.prevnext touchend.prevnext': function() {
                            $(this).stop(true, false).fadeTo('fast', 0.01);
                        }
                    });
                }

                //アノテーション表示
                var annotations = getCanvasAnnotations(page);
                if (annotations) {
                    var markers = [];
                    var markerZabutons = [];
                    var textMarkerBoundingBoxSizes = [];
                    var getPointFromFragment = function(fragment) {
                        var point = null;
                        if (fragment) {
                            //https://www.w3.org/TR/media-frags/#naming-space
                            var match = fragment.match(/xy=(?:pixel:)?([0-9]+),([0-9]+)/);
                            if (match) {
                                var x = parseInt(match[1], 10);
                                var y = parseInt(match[2], 10);
                                point = L.point(x, y);
                            }
                        }
                        return point;
                    };
                    if (!L.Icon.IcvShadow) {
                        setupLeafletCustomIcon();
                    }
                    var numberOfOneByOneSizeBoundingBoxes = 0;
                    for (var i = 0; i < annotations.length; i++) {
                        var annotation = annotations[i];
                        var annotBounds = getBoundsFromFragment(annotation.fragment);
                        if (annotBounds) {
                            if ($.isPlainObject(annotation.resource) && $.isPlainObject(annotation.resource.marker)) {
                                var resource = annotation.resource;
                                var marker = resource.marker;
                                var resourceChars;
                                var markerUrl;
                                var markerAnchorPoint;
                                var markerHtml;
                                var markerText;
                                var markerId = annotation['@id'] || i + 1;
                                var markerType = 0; //0: border, 1: char, 2: icon
                                if (resource.format === 'text/html') {
                                    resourceChars = getPropertyValueI18n(resource.chars);
                                } else { // text/plainなど
                                    if (resource.chars) {
                                        var resourceChars_ = getPropertyValueI18n(resource.chars);
                                        if (resourceChars_) {
                                            resourceChars = $('<span>').text(resourceChars_).prop('outerHTML');
                                        }
                                    }
                                }
                                if (marker['@id'] && marker['@type'] === 'dctypes:Image') {
                                    //画像マーカー
                                    var markerUrl_ = getPropertyValueI18n(marker['@id']);
                                    if (markerUrl_) {
                                        var markerIdElems = markerUrl_.split('#');
                                        markerUrl = markerIdElems[0];
                                        if (markerIdElems.length > 1) {
                                            markerAnchorPoint = getPointFromFragment(markerIdElems[1]);
                                        }
                                    }
                                }
                                if (markerUrl) {
                                    //画像マーカー
                                    markerType = 2;
                                    iconMarkerExist = true;
                                    markerHtml = $('<img>').attr({ 'data-marker-id': markerId, src: markerUrl }).prop('outerHTML');
                                } else if ('text' in marker) {
                                    //文字マーカー
                                    markerType = 1;
                                    textMarkerExist = true;
                                    var $markerText = $('<span>').attr('data-marker-id', markerId).text(getPropertyValueI18n(marker.text));
                                    if (marker.color) {
                                        $markerText.css('color', marker.color);
                                        $markerText.attr('data-marker-color', marker.color);
                                    }
                                    markerHtml = $markerText.prop('outerHTML');
                                    markerText = $markerText.text();
                                } else {
                                    //枠マーカー
                                    markerType = 0;
                                }

                                if (markerType) {
                                    //文字マーカー、画像マーカー
                                    var divIconOptions = {
                                        html: markerHtml,
                                        className: 'icv-annotation-div-icon'
                                    };
                                    if (markerAnchorPoint) {
                                        divIconOptions.iconAnchor = markerAnchorPoint;
                                    }
                                    var center = annotBounds.getCenter();
                                    var myIcon = L.divIcon(divIconOptions);
                                    var markerOptions = {
                                        icon: myIcon,
                                        clickable: (markerUrl || resourceChars) ? true : false,
                                        name: ANNOTATION_LAYER_NAME,
                                        origCenterLat: center.lat,
                                        origCenterLng: center.lng,
                                        anchorPoint: markerAnchorPoint,
                                        markerId: markerId,
                                        markerType: markerType
                                    };
                                    if (markerType === 1) {
                                        //文字マーカー
                                        markerOptions.text = markerText;

                                        //文字マーカーの上書き表示モードで背景に敷く画像
                                        var zoom = map.getZoom();
                                        var sw = map.project(annotBounds._southWest);
                                        var ne = map.project(annotBounds._northEast);
                                        var w = Math.abs(sw.x - ne.x);
                                        var h = Math.abs(sw.y - ne.y);
                                        if (w < 1) {
                                            w = 1;
                                        }
                                        if (h < 1) {
                                            h = 1;
                                        }
                                        var customColorHex = textMarkerZabutonColor || 'CCCCCC';
                                        var shadowSVG = makeZabutonSVG(w, h, customColorHex);
                                        var iconOptions = {
                                            iconUrl: shadowSVG,
                                            iconRetinaUrl: shadowSVG,
                                            iconSize: [w, h],
                                            className: 'textMarkerZabuton',
                                            zoom: zoom
                                        };
                                        //img要素のカスタムデータ属性で元のサイズを保持するように拡張したL.Iconを用いる
                                        var zabuton = new L.Icon.IcvShadow(iconOptions);
                                        var markerZabutonOptions = {
                                            icon: zabuton,
                                            clickable: false,
                                            draggable: false,
                                            keyboard: false
                                        };
                                        //markerPaneではなくshadowPaneにアイコンを表示するように変更したL.Markerを用いる
                                        var markerZabuton = new L.Marker.IcvShadow(center, markerZabutonOptions);
                                        markerZabutons.push(markerZabuton);
                                        textMarkerBoundingBoxSizes.push({w: w, h: h});
                                        if (w === 1 && h === 1) {
                                            numberOfOneByOneSizeBoundingBoxes++;
                                        }
                                    }
                                    var marker_;
                                    if (markerUrl || resourceChars) {
                                        marker_ = L.marker(center, markerOptions).bindPopup(resourceChars);
                                    } else {
                                        marker_ = L.marker(center, markerOptions);
                                    }
                                    markers.push(marker_);
                                } else {
                                    //枠マーカー
                                    var bounds_ = [annotBounds.getNorthWest(), annotBounds.getNorthEast(),
                                        annotBounds.getSouthEast(), annotBounds.getSouthWest(), annotBounds.getNorthWest()];
                                    var weight;
                                    if ('border-width' in marker) {
                                        weight = parseInt(marker['border-width'], 10);
                                    }
                                    if (isNaN(weight)) {
                                        weight = 2; //未指定の場合や指定エラーの場合のデフォルト値（値0の指定は有効とする）
                                    }
                                    var polyOption__ = {
                                        color: marker['border-color'] || '#00BFFF',
                                        weight: weight,
                                        fillOpacity: 0,
                                        clickable: isBorderMarkerEditingEnabled() ? true : (resourceChars ? true : false),
                                        markerId: markerId,
                                    };
                                    var marker__;
                                    if (isBorderMarkerEditingEnabled()) {
                                        var $editBorderMarkerWrapper = $('<div>').css({'text-align': 'center', 'width': '100%'}).addClass('border_marker_popup_edit_region');
                                        var $editBorderMarker = $('<a>').addClass('border_marker_popup_edit_region_link').attr({
                                            'href': 'javascript:void("EditRegion")',
                                            'data-marker-id': markerId,
                                        }).text((lng !== 'ja') ? 'Edit Region' : '領域の編集');
                                        if (resourceChars) {
                                            $editBorderMarkerWrapper.append('<hr style="margin: 1em 0;">');
                                        }
                                        $editBorderMarkerWrapper.append($editBorderMarker);
                                        var editBorderMarker = $editBorderMarkerWrapper.prop('outerHTML');
                                        marker__ = L.rectangle(bounds_, polyOption__).bindPopup((resourceChars ? resourceChars : '') + editBorderMarker);
                                        marker__.on('popupopen', function() {
                                            if (drawControlEditOnly._map) {
                                                $('.border_marker_popup_edit_region').hide();
                                            }
                                        });
                                    } else {
                                        if (resourceChars) {
                                            marker__ = L.rectangle(bounds_, polyOption__).bindPopup(resourceChars);
                                        } else {
                                            marker__ = L.rectangle(bounds_, polyOption__);
                                        }
                                    }
                                    markers.push(marker__);
                                }
                            }
                        }
                    }
                    if (markers.length > 0) {
                        L.layerGroup(markers).addTo(map);

                        //文字マーカーが存在し、bounding boxが与えられていると考えられる場合
                        var worthAdjustingTextMarker = markerZabutons.length > 0 && markerZabutons.length !== numberOfOneByOneSizeBoundingBoxes;
                        if (worthAdjustingTextMarker) {
                            //文字マーカーの背景塗りつぶし画像を追加
                            L.layerGroup(markerZabutons).addTo(map);
                            textMarkerZabutonUpdate();
                            //文字マーカーの背景色調整
                            var thumbnailUrl = getThumbnailUrl(page, getRegeionFromFragment(pageInfos[page].fragment), 100, 100);
                            var img = new Image();
                            img.onload = function() {
                                function rgbToGray(rgbArray) {
                                    return 0.299 * rgbArray[0] + 0.587 * rgbArray[1] + 0.114 * rgbArray[2];
                                }
                                try {
                                    var colorThief = new ColorThief();
                                    var brightestIndex = -1;
                                    var brightestGray = 0;
                                    var pallets = colorThief.getPalette(img, 5);
                                    for (var j = 0; j < pallets.length; j++) {
                                        var gray = rgbToGray(pallets[j]);
                                        if (gray > brightestGray) {
                                            brightestGray = gray;
                                            brightestIndex = j;
                                        }
                                    }
                                    var rgb = pallets[brightestIndex];
                                    if (rgb) {
                                        var colorHex = '' + ((1 << 24) + (rgb[0] << 16) + (rgb[1] << 8) + rgb[2]).toString(16).slice(1);
                                        if (colorHex !== textMarkerZabutonColor) {
                                            textMarkerZabutonColor = colorHex; //別のコマに移動したときの初期値としても利用する
                                            $('.textMarkerZabuton').each(function() {
                                                var $this = $(this);
                                                var origWidth = $this.attr('data-width');
                                                var origHeight = $this.attr('data-height');
                                                var src = $this.attr('src');
                                                if (src) {
                                                    var newSrc;
                                                    if (origWidth && origHeight) {
                                                        newSrc = makeZabutonSVG(origWidth, origHeight, colorHex);
                                                    } else {
                                                        newSrc = src.replace(/(fill%3D%22%23)([0-9A-Fa-f]+)(%22)/, '$1' + colorHex + '$3');
                                                    }
                                                    $this.attr('src', newSrc);
                                                }
                                            });
                                        }
                                    }
                                } catch (e) {
                                    //console.log(e);
                                }
                            };
                            img.crossOrigin = 'Anonymous';
                            img.src = thumbnailUrl;
                            //文字マーカーのフォントサイズ調整
                            var lenSum = 0;
                            var lenAve;
                            var boxNum = textMarkerBoundingBoxSizes.length;
                            for (i = 0; i < boxNum; i++) {
                                var size = textMarkerBoundingBoxSizes[i];
                                var area = size.w * size.h;
                                var len = Math.sqrt(area);
                                lenSum += len;
                            }
                            if (boxNum > 0) {
                                lenAve = lenSum / boxNum; //px
                            }
                            var scale = Math.pow(2, map.getZoom());
                            var newFontSize = lenAve ? (lenAve / scale) + 'px' : '';
                            $('.leaflet-marker-pane').css({
                                'font-size': newFontSize //ズームレベル0のときのサイズに換算して設定
                            });
                            $('.icv-annotation-div-icon > span').css({
                                'font-size': (scale * 100) + '%' //ズームレベルに応じて表示倍率を設定
                            });
                        }

                        //マーカー表示調整パネル
                        var OFFSET_FACTOR = 1;
                        var sliderOffsetXFunc = function(value) {
                            annotationDisplayConf.offsetX = value;
                            map.eachLayer(function(layer) {
                                if (layer.options && layer.options.name === ANNOTATION_LAYER_NAME) {
                                    var latLng = layer.getLatLng();
                                    layer.setLatLng([latLng.lat, layer.options.origCenterLng + (value - 50) * OFFSET_FACTOR]);
                                }
                            });
                        };
                        var sliderOffsetYFunc = function(value) {
                            annotationDisplayConf.offsetY = value;
                            map.eachLayer(function(layer) {
                                if (layer.options && layer.options.name === ANNOTATION_LAYER_NAME) {
                                    var latLng = layer.getLatLng();
                                    layer.setLatLng([layer.options.origCenterLat - (value - 50) * OFFSET_FACTOR, latLng.lng]);
                                }
                            });
                        };
                        var sliderOpacityFunc = function(value) {
                            annotationDisplayConf.opacity = value;
                            $('.icv-annotation-div-icon').css({ opacity: value / 100 });
                            $('.leaflet-overlay-pane').css({ opacity: value / 100 });
                            $('.textMarkerZabuton').css({ opacity: value / 100 });
                        };
                        var sliderSizeFunc = function(value) {
                            annotationDisplayConf.size = value;
                            $('.icv-annotation-div-icon > span').parent().css({
                                'display': 'flex',
                                'align-items': 'center',
                                'justify-content': 'center',
                                'font-size': (value / 50) + 'em'
                            });
                            map.eachLayer(function(layer) {
                                if (layer.options && layer.options.name === ANNOTATION_LAYER_NAME) {
                                    if (layer.options.markerId && layer.options.anchorPoint) {
                                        $('.icv-annotation-div-icon > img[data-marker-id="' + layer.options.markerId + '"]').css({
                                            'transform-origin': layer.options.anchorPoint.x + 'px ' + layer.options.anchorPoint.y + 'px'
                                        });
                                    }
                                }
                            });
                            $('.icv-annotation-div-icon > img').css({
                                'transform': 'scale(' + value / 50 + ')'
                            });
                        };
                        var sliderOffsetX = {
                            callback: sliderOffsetXFunc,
                            id: 'sliderOffsetX',
                            name: (lng !== 'ja') ? 'Horizontal Offset' : '横方向移動量',
                            initialValue: annotationDisplayConf.offsetX,
                            title: (lng !== 'ja') ? 'Left <--> Right' : '左←→右'
                        };
                        var sliderOffsetY = {
                            callback: sliderOffsetYFunc,
                            id: 'sliderOffsetY',
                            name: (lng !== 'ja') ? 'Vertical Offset' : '縦方向移動量',
                            initialValue: annotationDisplayConf.offsetY,
                            title: (lng !== 'ja') ? 'Up <--> Down' : '上←→下'
                        };
                        var sliderOpacity = {
                            callback: sliderOpacityFunc,
                            id: 'sliderOpacity',
                            name: (lng !== 'ja') ? 'Opacity' : '不透明度',
                            initialValue: annotationDisplayConf.opacity,
                            title: (lng !== 'ja') ? '' : '透明←→不透明'
                        };
                        var sliderSize = {
                            callback: sliderSizeFunc,
                            id: 'sliderSize',
                            name: (lng !== 'ja') ? 'Size' : 'サイズ',
                            initialValue: annotationDisplayConf.size,
                            title: (lng !== 'ja') ? 'Small <--> Large' : '小←→大'
                        };
                        var curation = getBrowsingCurationJson();
                        var legendUrl;
                        var legendLabel = (lng !== 'ja') ? 'Legend' : '凡例';
                        if (curation && 'related' in curation) {
                            var relatedArray = [];
                            if ($.isArray(curation.related)) {
                                relatedArray = curation.related;
                            } else if ($.isPlainObject(curation.related)) {
                                relatedArray = [curation.related];
                            }
                            for (var j = 0; j < relatedArray.length; j++) {
                                var related = relatedArray[j];
                                if ($.isPlainObject(related)) {
                                    if (related['@id'] && related['@type'] === 'cr:MarkerLegend') {
                                        legendUrl = getPropertyValueI18n(related['@id']);
                                        if (related.label) {
                                            legendLabel = getPropertyValueI18n(related.label);
                                        }
                                    }
                                }
                            }
                        }
                        var slidersOption = { position: 'bottomleft' };
                        if (legendUrl) {
                            slidersOption.footer = $('<a>').attr({ href: legendUrl, target: '_blank' }).text(legendLabel).prop('outerHTML');
                        }
                        L.control.sliders([sliderOffsetX, sliderOffsetY, sliderOpacity, sliderSize], slidersOption).addTo(map);
                        sliderOffsetXFunc(annotationDisplayConf.offsetX);
                        sliderOffsetYFunc(annotationDisplayConf.offsetY);
                        sliderOpacityFunc(annotationDisplayConf.opacity);
                        sliderSizeFunc(annotationDisplayConf.size);

                        //文字マーカー表示設定パネル
                        if (worthAdjustingTextMarker) {
                            var $textMarkerRenderMode = $('<div>').attr('id', 'text_marker_render_mode').addClass('btn-group').attr('data-toggle', 'buttons');
                            $textMarkerRenderMode.append('<h6>' + ((lng !== 'ja') ? 'Text Marker' : '文字マーカー表示') + '</h6>');
                            var textMarkerRenderModes = [
                                [{ '@language': 'en', '@value': 'Normal' }, { '@language': 'ja', '@value': '標準' }],
                                [{ '@language': 'en', '@value': 'Overwrite' }, { '@language': 'ja', '@value': '上書き' }],
                            ];
                            for (i = 0; i < textMarkerRenderModes.length; i++) {
                                var $label_ = $('<label>').addClass('btn btn-default btn-sm');
                                if ((i === 0 && !textMarkerRenderOverwrite) || (i === 1 && textMarkerRenderOverwrite)) {
                                    $label_.addClass('active');
                                }
                                var $input_ = $('<input>').attr('type', 'radio').attr('name', 'options')
                                    .attr('value', i).attr('id', 'text_marker_render_mode_' + i);
                                var label = getPropertyValueI18n(textMarkerRenderModes[i]);
                                $label_.append($input_).append(label);
                                $textMarkerRenderMode.append($label_);
                            }
                            var slidersOption_ = {
                                position: 'bottomleft',
                                footer: $textMarkerRenderMode.prop('outerHTML')
                            };
                            L.control.sliders([], slidersOption_).addTo(map);
                            $('#text_marker_render_mode input[type=radio]').change(function() {
                                textMarkerRenderOverwrite = (parseInt(this.value, 10) > 0);
                                textMarkerZabutonUpdate();
                            });
                        }

                        if (considerBoundsLater) {
                            bounds = L.featureGroup(markers).getBounds();
                        }

                        //枠マーカーの領域編集機能
                        if (isBorderMarkerEditingEnabled()) {
                            $(document).off('.selectedRectEdit', '.border_marker_popup_edit_region_link');
                            $(document).on('click.selectedRectEdit', '.border_marker_popup_edit_region_link', function() {
                                map.closePopup();
                                if (drawControlDrawOnly) {
                                    borderMarkerEditTargetId = $(this).attr('data-marker-id');
                                    var targetMarker;
                                    map.eachLayer(function(layer) {
                                        if (layer.options && 'markerId' in layer.options) {
                                            if (layer.options.markerId === borderMarkerEditTargetId) {
                                                targetMarker = layer;
                                            }
                                        }
                                    });
                                    if (targetMarker) {
                                        var annotBounds = targetMarker.getBounds();
                                        try {
                                            //マウス操作をエミュレートして、枠マーカーと同じ大きさのダミー矩形を新規作成する
                                            //このダミー矩形のリサイズ等により、枠マーカーの新しいサイズ・位置を指定する
                                            var rectangle = drawControlDrawOnly._toolbars.draw._modes.rectangle;
                                            rectangle.button.click();  // rectangle.handler.enable();
                                            rectangle.handler._onMouseDown({latlng: annotBounds.getNorthWest(), originalEvent: new MouseEvent('mousedown')});
                                            rectangle.handler._onMouseMove({latlng: annotBounds.getSouthEast()});
                                            rectangle.handler._onMouseUp();
                                        } catch(err) {
                                            borderMarkerEditTargetId = null;
                                        }
                                    }
                                }
                            });
                            $(document).off('icv.L.Draw.Event.CREATED_DONE');
                            $(document).on('icv.L.Draw.Event.CREATED_DONE', function() {
                                //ダミー矩形の作成完了イベントを受け取れば、編集モードに切り替える。
                                if (drawControlEditOnly && borderMarkerEditTargetId) {
                                    try {
                                        drawControlEditOnly._toolbars.edit._modes.edit.button.click();
                                    } catch(err) {
                                        //
                                    }
                                }
                            });
                        }
                    }
                }
                if (considerBoundsLater) {
                    if (bounds) {
                        //アノテーション領域全体が含まれるようにズームする
                        map.fitBounds(bounds);
                    } else {
                        //アノテーションが含まれていなかった場合は全体表示
                        map.fitBounds(getBoundsFull());
                    }
                }
            }
            iiif.off('load');
        });
        function textMarkerZabutonUpdate() {
            //文字マーカー表示モード切り替え時の背景と文字マーカー色の表示更新
            if (textMarkerRenderOverwrite) {
                $('.textMarkerZabuton').show();
                $('.icv-annotation-div-icon > span').css({
                    'color': '#000'
                });
            } else {
                $('.textMarkerZabuton').hide();
                $('.icv-annotation-div-icon > span').each(function() {
                    var markerColor = $(this).attr('data-marker-color');
                    $(this).css({
                        'color': markerColor ? markerColor : ''
                    });
                });
            }
        }
        map.on('fullscreenchange', function() {
            //フルスクリーン表示のときに限り、Leaflet内にコマ移動ボタンを表示
            if (isFullscreen()) {
                if (pageInfos.length > 1) {
                    var customActionNext = L.ToolbarAction.extend({
                        options: {
                            toolbarIcon: {
                                html: (lng !== 'ja') ? '»' : '次',
                                tooltip: (lng !== 'ja') ? 'Next' : '次のコマへ移動'
                            }
                        },
                        addHooks: function() {
                            onNextPage();
                        }
                    });
                    var customActionPrev = L.ToolbarAction.extend({
                        options: {
                            toolbarIcon: {
                                html: (lng !== 'ja') ? '«' : '前',
                                tooltip: (lng !== 'ja') ? 'Previous' : '前のコマへ移動'
                            }
                        },
                        addHooks: function() {
                            onPrevPage();
                        }
                    });
                    if (L.ToolbarOrig) {
                        L.Toolbar = L.ToolbarOrig;
                    }
                    try {
                        toolbarNextPrev = new L.Toolbar.Control({
                            position: 'topleft',
                            actions: [customActionNext, customActionPrev]
                        });
                        toolbarNextPrev.addTo(map);
                    } catch (e) {
                        toolbarNextPrev = null;
                    }
                    if (L.ToolbarDraw) {
                        L.Toolbar = L.ToolbarDraw;
                    }
                }
            } else {
                if (toolbarNextPrev) {
                    if (L.ToolbarOrig) {
                        L.Toolbar = L.ToolbarOrig;
                    }
                    map.removeLayer(toolbarNextPrev);
                    if (L.ToolbarDraw) {
                        L.Toolbar = L.ToolbarDraw;
                    }
                }
            }
        });
        if (manifest.logo) {
            var logoUrls = getUriRepresentations(manifest.logo);
            if ($.isArray(logoUrls) && logoUrls.length > 0) {
                var logoUrl = logoUrls[0];
                var credit = L.controlCredits({
                    image: logoUrl,
                    link: 'javascript:iiifViewer.showInfo();',
                    text: 'More info...',
                    width: 24,
                    height: 32
                });
                credit.addTo(map);
                $('.leaflet-credits-control a').removeAttr('target');
            }
        }
        function getCroppedRegeion(layer) {
            if (iiif.x && iiif.y) {
                var bounds = layer.getBounds();
                var minLatLng = bounds.getNorthWest();
                var maxLatLng = bounds.getSouthEast();
                var maxCanvasPoint = L.point(iiif.x, iiif.y);
                var maxCanvasLatLng = map.unproject(maxCanvasPoint, iiif.maxNativeZoom); //LatLng
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
                    return [region.x, region.y, region.width, region.height].join(',');
                }
            }
            return null;
        }
        function getCroppedImageUrl(region, size) {
            if (region && iiif._baseUrl) {
                var cropUrl = L.Util.template(iiif._baseUrl, {
                    region: region,
                    size: size || 'full',
                    rotation: 0,
                    quality: iiif.options.quality,
                    format: iiif.options.tileFormat
                });
                return cropUrl;
            }
            return null;
        }
        function getCroppedImageExportHtml(cropUrl, opt) {
            var croppedImageExport = getCroppedImageExport(); //function or url
            if (croppedImageExport) {
                if ($.isFunction(croppedImageExport)) {
                    return croppedImageExport(cropUrl, opt);
                } else {
                    var params_ = [];
                    params_.push('image=' + encodeURIComponent(cropUrl));
                    params_.push('lang=' + lng);
                    if (params_.length > 0) {
                        croppedImageExport += '?' + params_.join('&');
                    }
                    var label = (lng !== 'ja') ? 'Clipping' : 'クリッピング';
                    return $('<a>').attr({ href: croppedImageExport, target: '_blank' }).addClass('btn btn-outline-primary').text(label).prop('outerHTML');
                }
            }
            return '';
        }
        function getCroppedImagePopupContents(cropUrl, opt) {
            var popupContents;
            if (conf.service.croppedImageExportUrl || conf.service.croppedImageExport) {
                popupContents = getCroppedImageExportHtml(cropUrl, opt);
            }
            if (!popupContents) {
                var $croppedLink = $('<a>').attr({ href: cropUrl, target: '_blank' }).text(cropUrl);
                popupContents = $('<div>').css('word-break', 'break-all').append($croppedLink).prop('outerHTML');
            }
            return popupContents;
        }
        function setPageInfoCropFragment(region) {
            if (region === undefined) {
                if (pageInfos[page].cropFragment !== undefined) {
                    delete pageInfos[page].cropFragment;
                    setupNavigations();
                }
            } else {
                pageInfos[page].cropFragment = 'xywh=' + region;
                setupNavigations();
            }
        }
        setPageInfoCropFragment();
        var drawnItems = new L.FeatureGroup();
        map.addLayer(drawnItems);
        if (lng === 'ja') {
            L.drawLocal.draw.toolbar.actions.text = 'キャンセル';
            L.drawLocal.draw.toolbar.actions.title = '選択モードをキャンセル';
            L.drawLocal.draw.toolbar.buttons.rectangle = '矩形領域を選択';
            L.drawLocal.draw.handlers.rectangle.tooltip.start = 'クリックしてドラッグで領域選択を開始';
            L.drawLocal.draw.handlers.simpleshape.tooltip.end = 'マウスを放して領域選択を完了';

            L.drawLocal.edit.toolbar.actions.save.text = '適用';
            L.drawLocal.edit.toolbar.actions.save.title = '編集を適用';
            L.drawLocal.edit.toolbar.actions.cancel.text = 'キャンセル';
            L.drawLocal.edit.toolbar.actions.cancel.title = '編集をキャンセル';

            L.drawLocal.edit.toolbar.buttons.edit = '領域選択を編集';
            L.drawLocal.edit.toolbar.buttons.remove = '領域選択を終了';

            L.drawLocal.edit.handlers.edit.tooltip.text = 'ハンドルをドラッグして領域選択を編集</span><br>' +
                '<span class="leaflet-draw-tooltip-subtext">編集を取り消すには「キャンセル」をクリック</span>' +
                '<span class="leaflet-draw-tooltip-subsubtext">';
            L.drawLocal.edit.handlers.edit.tooltip.subtext = '';
        } else {
            L.drawLocal.edit.toolbar.actions.save.text = 'Apply';
            L.drawLocal.edit.toolbar.actions.save.title = 'Apply changes';
        }
        if (!L.Control.DrawUndraggable) {
            L.Control.DrawUndraggable = L.Control.Draw.extend({
                initialize: function(options) {
                    L.Util.setOptions(this, options);
                    L.Control.Draw.prototype.initialize.call(this, options);
                },
                onAdd: function(map) {
                    var container = L.Control.Draw.prototype.onAdd.call(this, map);
                    $(container).find('a').attr('draggable', 'false');
                    return container;
                }
            });
        }
        var drawControlDrawOnly = new L.Control.DrawUndraggable({
            draw: {
                polyline: false,
                polygon: false,
                circle: false,
                marker: false
            },
            edit: false,
            position: 'topright'
        });
        var drawControlEditOnly = new L.Control.DrawUndraggable({
            draw: false,
            edit: {
                featureGroup: drawnItems
            },
            position: 'topright'
        });
        map.addControl(drawControlDrawOnly);
        function bindDrawnItemsPopupAndTooltip() {
            drawnItems.eachLayer(function(layer) {
                if (layer instanceof L.Polygon) {
                    //popup
                    var region = getCroppedRegeion(layer);
                    var cropUrl = getCroppedImageUrl(region, getFullSizeKeyword(page));
                    var popupContents;
                    if (cropUrl !== null) {
                        var opt = {
                            manifest: getManifestUrl(page),
                            canvas: getCanvasId(page),
                            xywh: region
                        };
                        popupContents = getCroppedImagePopupContents(cropUrl, opt);
                    } else {
                        popupContents = $('<div>').text((lng !== 'ja') ? 'IIIF Image API is not available' : 'IIIF Image APIが利用できません').prop('outerHTML');
                    }
                    layer.bindPopup(popupContents);
                    //tooltip
                    if (iiif.hasImageAPIservice) {
                        layer.bindLabel((lng !== 'ja') ? 'Click to view info' : '選択領域クリックで画像URL表示',
                            { className: 'leaflet-label-custom' });
                    }
                }
            });
        }
        function unbindDrawnItemsPopupAndTooltip() {
            drawnItems.eachLayer(function(layer) {
                if (layer instanceof L.Polygon) {
                    layer.unbindPopup();
                    layer.unbindLabel();
                }
            });
        }
        map.on(L.Draw.Event.DRAWSTART, function(e) {
            e.control = drawControlDrawOnly;
            handleEvent(L.Draw.Event.DRAWSTART, e);
        });
        map.on(L.Draw.Event.CREATED, function(e) {
            if (iiif.x && iiif.y) {
                handleEvent(L.Draw.Event.CREATED, e);
                var layer = e.layer;
                var region = getCroppedRegeion(layer);
                var cropUrl = getCroppedImageUrl(region, getFullSizeKeyword(page));
                if (cropUrl !== null || (iiif.hasImageAPIservice === false && region)) {
                    setPageInfoCropFragment(region);
                }
                drawnItems.addLayer(layer);
                bindDrawnItemsPopupAndTooltip();

                if (drawControlDrawOnly._map) {
                    map.removeControl(drawControlDrawOnly);
                }
                map.addControl(drawControlEditOnly);
                if (borderMarkerEditTargetId) {
                    try {
                        //枠マーカーの領域編集機能において削除機能は提供しない
                        $(drawControlEditOnly._toolbars.edit._modes.remove.button).hide();
                    } catch(err) {
                        //
                    }
                    //ダミー矩形作成後、編集モードに切り替えるため、作成完了イベントを通知する。
                    $(document).trigger('icv.L.Draw.Event.CREATED_DONE');
                }

                //削除対象の選択 → 適用 の手順を踏まず、ごみ箱アイコンのクリックで即時削除する
                $('.leaflet-draw-edit-remove').on('click', function() {
                    drawnItems.eachLayer(function(layer) {
                        drawnItems.removeLayer(layer);
                    });
                    map.fire(L.Draw.Event.DELETED);
                });
            }
        });
        map.on(L.Draw.Event.EDITED, function(e) {
            //編集開始後、適用が選択されたとき（キャンセルや削除を選択した場合は呼ばれない）
            //EDITSTART -> (EDITRESIZE/EDITMOVE) -> (EDITED) -> EDITSTOP
            if (iiif.x && iiif.y) {
                handleEvent(L.Draw.Event.EDITED, e);
                var layers = e.layers;
                layers.eachLayer(function(layer) {
                    layer.closePopup();
                    var region = getCroppedRegeion(layer);
                    var cropUrl = getCroppedImageUrl(region, getFullSizeKeyword(page));
                    if (cropUrl !== null) {
                        setPageInfoCropFragment(region);
                    }
                });
                if (borderMarkerEditTargetId) {
                    map.eachLayer(function(layer) {
                        if (layer.options && 'markerId' in layer.options) {
                            if (layer.options.markerId === borderMarkerEditTargetId) {
                                var layers = e.layers;
                                layers.eachLayer(function(layer_) {
                                    var bounds = layer_.getBounds(); //編集したダミー矩形
                                    layer.setBounds(bounds);
                                    //アノテーションデータの更新
                                    var hasChanged = false;
                                    var annotations = getCanvasAnnotations(page);
                                    for (var i = 0; i < annotations.length; i++) {
                                        var annotation = annotations[i];
                                        if ($.isPlainObject(annotation.resource) && $.isPlainObject(annotation.resource.marker)) {
                                            var markerId = annotation['@id'] || i + 1;
                                            if (layer.options.markerId === markerId) {
                                                var region = getCroppedRegeion(layer);
                                                var fragment = 'xywh=' + region;
                                                if (annotation.fragment !== fragment) {
                                                    hasChanged = true;
                                                    annotation.fragment = fragment;
                                                    var canvasIdBase = annotation.on.split('#')[0];
                                                    annotation.on = canvasIdBase + '#' + fragment;
                                                }
                                            }
                                        }
                                    }
                                    if (hasChanged) {
                                        if (storage) {
                                            $('#fav_star_link').hide();
                                            $('#curation_nav').show();
                                        }
                                    }
                                });
                            }
                        }
                    });
                }
            }
        });
        map.on(L.Draw.Event.DELETED, function(e) {
            //DELETESTART -> DELETED -> DELETESTOP
            handleEvent(L.Draw.Event.DELETED, e);
            var count = 0;
            drawnItems.eachLayer(function() {
                count++;
            });
            if (count === 0) {
                if (drawControlEditOnly._map) {
                    map.removeControl(drawControlEditOnly);
                }
                map.addControl(drawControlDrawOnly);
                setPageInfoCropFragment();
            }
        });
        map.on(L.Draw.Event.EDITSTART, function(e) {
            e.control = drawControlEditOnly;
            handleEvent(L.Draw.Event.EDITSTART, e);
            drawnItems.eachLayer(function(layer) {
                layer.closePopup();
            });
            unbindDrawnItemsPopupAndTooltip();
        });
        map.on(L.Draw.Event.EDITRESIZE, function(e) {
            if (iiif.x && iiif.y) {
                handleEvent(L.Draw.Event.EDITRESIZE, e);
                var layer = e.layer;
                var region = getCroppedRegeion(layer);
                if (region) {
                    var elems = region.split(',');
                    var w = parseInt(elems[2], 10);
                    var h = parseInt(elems[3], 10);
                    var cropInfo = w + ' x ' + h + ((lng !== 'ja') ? ' pixels' : ' ピクセル');
                    if (h > 0) {
                        var ratio = (w / h).toFixed(3);
                        if (lng !== 'ja') {
                            cropInfo += ' (' + ratio + ')';
                        } else {
                            cropInfo += ' （縦横比 ' + ratio + '）';
                        }
                    }
                    if (lng === 'ja') {
                        $('.leaflet-draw-tooltip-subsubtext').html('<br>' + cropInfo);
                    } else {
                        $('.leaflet-draw-tooltip-subtext').html(cropInfo);
                    }
                }
            }

        });
        map.on(L.Draw.Event.EDITSTOP, function(e) {
            //編集モード完了時（適用選択時に加え、キャンセルや削除を選択した場合も呼ばれる）
            //EDITSTART -> (EDITRESIZE/EDITMOVE) -> (EDITED) -> EDITSTOP
            handleEvent(L.Draw.Event.EDITSTOP, e);
            bindDrawnItemsPopupAndTooltip();
            if (borderMarkerEditTargetId) {
                try {
                    //領域編集完了後はダミー矩形を削除する
                    drawControlEditOnly._toolbars.edit._modes.remove.button.click();
                } catch(err) {
                    //
                }
                borderMarkerEditTargetId = null;
            }
        });
        map.on(L.Draw.Event.DELETESTART, function(e) {
            //DELETESTART -> DELETED -> DELETESTOP
            handleEvent(L.Draw.Event.DELETESTART, e);
            drawnItems.eachLayer(function(layer) {
                layer.closePopup();
            });
        });
        map.on('zoomstart', function() {
            if (textMarkerExist && !iconMarkerExist) {
                $('.leaflet-marker-pane').hide();
                $('.leaflet-shadow-pane').hide();
            }
        });
        map.on('zoomend', function() {
            if (textMarkerExist) {
                var zoom = map.getZoom();
                var scale = Math.pow(2, zoom);
                $('.textMarkerZabuton').each(function() {
                    //ズームレベルに応じて文字マーカー背景の位置・サイズを更新
                    var $this = $(this);
                    var origMarginLeft = $this.attr('data-margin-left');
                    var origMarginTop = $this.attr('data-margin-top');
                    var origWidth = $this.attr('data-width');
                    var origHeight = $this.attr('data-height');
                    if (origMarginLeft) {
                        $this.css('margin-left', (origMarginLeft * scale) + 'px');
                    }
                    if (origMarginTop) {
                        $this.css('margin-top', (origMarginTop * scale) + 'px');
                    }
                    if (origWidth) {
                        $this.css('width', (origWidth * scale) + 'px');
                    }
                    if (origHeight) {
                        $this.css('height', (origHeight * scale) + 'px');
                    }
                });
                $('.icv-annotation-div-icon > span').css({
                    'font-size': (scale * 100) + '%' //ズームレベルに応じて表示倍率を設定
                });
            }
            if (textMarkerExist && !iconMarkerExist) {
                $('.leaflet-shadow-pane').show();
                $('.leaflet-marker-pane').show();
            }
        });

        if (conf.controls.enableAutoHide) {
            var fadeControls = '.leaflet-control-zoom, .leaflet-control-fullscreen, .leaflet-control-toolbar, .leaflet-draw, .leaflet-control-layers';
            $('#image_canvas').off('.fadeControls');
            $('#image_canvas').on({
                'mouseenter.fadeControls touchstart.fadeControls': function() {
                    clearTimeout(fadeControlsTimerID);
                    $(fadeControls, '#image_canvas').stop(true, false).fadeTo('fast', 1);
                },
                'mouseleave.fadeControls': function() {
                    clearTimeout(fadeControlsTimerID);
                    $(fadeControls, '#image_canvas').stop(true, false).fadeTo('fast', 0.01);
                },
                'touchend.fadeControls': function() {
                    clearTimeout(fadeControlsTimerID);
                    fadeControlsTimerID = setTimeout(function() {
                        $(fadeControls, '#image_canvas').stop(true, false).fadeTo(3000, 0.01);
                    }, 1000);
                }
            });
            clearTimeout(fadeControlsTimerID);
            fadeControlsTimerID = setTimeout(function() {
                if (!$('#image_canvas').is(':hover') || L.Browser.touch) {
                    $(fadeControls, '#image_canvas').stop(true, false).fadeTo(3000, 0.01);
                }
            }, 1000);
        }

        if (isFullscreenMode !== isFullscreen()) {
            toggleFullscreen();
        }
        updateHistory();

        $(document).trigger('icv.refreshPage', [map]); //イベント送出
    }

    function setupNavigations() {
        var i, j, k;
        var bookIndex = pageInfos[page].bookIndex;
        var pageLocal = pageInfos[page].pageLocal; //1-based
        var curation = curationInfo.curation || {};
        var manifest = getManifest(page);

        //資料名
        var manifestLabel = getPropertyValueI18n(manifest.label);
        if (isTimelineMode) {
            var canvasLabel = getPropertyValueI18n(getCanvasLabel(page));
            document.title = manifestLabel + ' / ' + canvasLabel;
        } else {
            document.title = manifestLabel + ' / ' + pageLocal;
        }
        var $curationDescriptionButton = null;
        if (curation.description) {
            var $curationDescriptionInfo = $('<span>').addClass('glyphicon glyphicon-info-sign');
            $curationDescriptionButton = $('<a>').attr({
                'href': 'javascript:void("showCurationDescription")',
                'title': (lng !== 'ja') ? 'Show Curation Description' : 'キュレーションの説明を表示'
            }).addClass('curation_description_link').html($curationDescriptionInfo);
            $curationDescriptionButton.on('click', function() {
                showDescription();
            });
        }
        var $relatedLink = null;
        if (manifest.related) {
            var relatedLinkUrl = getHtmlLinkUrl(manifest.related);
            if (relatedLinkUrl) {
                $relatedLink = $('<a>').attr('href', relatedLinkUrl).text(manifestLabel);
            }
        }
        var $curationRelatedLink = null;
        if (curation.related && curation.label) {
            var curationRelatedLinkUrl = getHtmlLinkUrl(curation.related);
            if (curationRelatedLinkUrl) {
                $curationRelatedLink = $('<a>').attr('href', curationRelatedLinkUrl).text(getPropertyValueI18n(curation.label));
            }
        }
        if ($relatedLink) {
            $('#book_title').html($relatedLink);
        } else {
            $('#book_title').text(manifestLabel);
        }
        if ($curationRelatedLink) {
            var $curationRelatedLinkSmall = $('<small>').append('（').append($curationRelatedLink);
            if ($curationDescriptionButton) {
                $curationRelatedLinkSmall.append($curationDescriptionButton);
            }
            $curationRelatedLinkSmall.append('）');
            $('#book_title').append($curationRelatedLinkSmall);
        } else if (curation.label || 'label' in params) {
            var curationLabel = curation.label ? getPropertyValueI18n(curation.label) : params.label;
            var $curationLabel = $('<span>').text(curationLabel);
            var $curationLabelSmall = $('<small>').append('（').append($curationLabel);
            if ($curationDescriptionButton) {
                $curationLabelSmall.append($curationDescriptionButton);
            }
            $curationLabelSmall.append('）');
            $('#book_title').append($curationLabelSmall);
        }

        //ページナビ
        var pageSelect = '';
        if (isFilteredContents) {
            //複数資料のうち、いずれかにおいてページ絞り込みがなされていれば、ピックアップありとする。
            pageSelect = (lng !== 'ja') ? 'Curation ' : 'キュレーション ';
        }
        pageSelect += '<select class="nav_select" onChange="iiifViewer.gotoPage(this);">';
        if (isTimelineMode) {
            for (i = 0; i < pageInfos.length; i++) {
                var label = getPropertyValueI18nAsHtml(getCanvasLabel(i), { allowMinimalHtmlTag: false });
                j = i + 1;
                if (i !== page) {
                    pageSelect += '<option value="' + j + '">' + label + '</option>';
                } else {
                    pageSelect += '<option value="' + j + '" selected>' + label + '</option>';
                }
            }
        } else {
            for (i = 0; i < pageInfos.length; i++) {
                j = i + 1;
                if (i !== page) {
                    pageSelect += '<option value="' + j + '">' + j + '</option>';
                } else {
                    pageSelect += '<option value="' + j + '" selected>' + j + ' / ' + pageInfos.length + '</option>';
                }
            }
        }
        pageSelect += '</select>';
        $('#page').html(pageSelect);

        var pageStepLabel;
        var steps = isTimelineMode ? conf.timeline.steps : conf.manifest.steps;
        if ($.isArray(steps) && steps.length > 0 && !isFilteredContents) {
            var idx = $.inArray(pageStep, steps);
            $('#increase_step').toggleClass('disabled', idx === steps.length - 1);
            $('#decrease_step').toggleClass('disabled', idx === 0);
            if (isTimelineMode && cursorInfo.step) {
                pageStepLabel = getTimeExpression(pageStep * cursorInfo.step);
            } else {
                pageStepLabel = getPageStepExpression(pageStep);
            }
            if (!setupNavigations.pageStepLabelWidth) {
                var labelHtml = '';
                for (i = 0; i < steps.length; i++) {
                    var step = steps[i];
                    var pageStepLabel_;
                    if (isTimelineMode && cursorInfo.step) {
                        pageStepLabel_ = getTimeExpression(step * cursorInfo.step);
                    } else {
                        pageStepLabel_ = getPageStepExpression(step);
                    }
                    labelHtml += getPrevPageStepLabel(pageStepLabel_) + '<br>' + getNextPageStepLabel(pageStepLabel_) + '<br>';
                }
                var $anchor = $('<a>').html(labelHtml);
                var $list = $('<li>').append($anchor);
                $('#page_nav').append($list);
                var pageStepLabelWidth_ = $anchor.outerWidth();
                $list.remove();
                if (pageStepLabelWidth_ > 0) {
                    pageStepLabelWidth_ += 1;
                    $('#page_nav li a').eq(0).css({ width: pageStepLabelWidth_, 'text-align': 'center' });
                    $('#page_nav li a').eq(1).css({ width: pageStepLabelWidth_, 'text-align': 'center' });
                    setupNavigations.pageStepLabelWidth = pageStepLabelWidth_;
                }
            }
        }
        if (pageStepLabel === undefined) {
            if (pageStep !== 1) {
                pageStepLabel = String(pageStep);
            } else {
                pageStepLabel = '';
            }
        }
        var prevPageStepLabel = getPrevPageStepLabel(pageStepLabel);
        var nextPageStepLabel = getNextPageStepLabel(pageStepLabel);
        $('#page_nav li a span').eq(0).text(prevPageStepLabel);
        $('#page_nav li a span').eq(1).text(nextPageStepLabel);

        //サムネイル一覧
        $('#show_thumbnails').text((lng !== 'ja') ? 'Thumbnails' : 'サムネイル一覧');

        //資料ナビ
        var bookSelect = ((lng !== 'ja') ? 'Books ' : '資料 ') + '<select class="nav_select" onChange="iiifViewer.gotoPage(this);">';
        for (i = 0; i < bookChangePages.length; i++) {
            j = i + 1;
            k = bookChangePages[i] + 1; //0-based to 1-based
            if (pageInfos[bookChangePages[i]].bookIndex !== pageInfos[page].bookIndex) {
                bookSelect += '<option value="' + k + '">' + j + '</option>';
            } else {
                if (bookChangePages[i] <= page && ((i < bookChangePages.length - 1 && page < bookChangePages[i + 1]) || i === bookChangePages.length - 1)) {
                    bookSelect += '<option value="' + k + '" selected>' + j + ' / ' + bookChangePages.length + '</option>';
                } else {
                    bookSelect += '<option value="' + k + '">' + j + '</option>';
                }
            }
        }
        bookSelect += '</select>';
        $('#books').html(bookSelect);

        //元資料の並び順で閲覧するリンク
        var manifestUrl = getManifestUrl(page);
        if ((isFilteredContents || bookChangePages.length > 1) && manifestUrl) {
            //ページ絞り込みあり、または複数資料を表示している場合
            //（後者のケースでは、個々の資料の総ページ数を表示する働きも兼ねる）
            var identifier = getIdentifierFromManifestUrl(manifestUrl);
            var params_ = [];
            if (identifier) {
                params_.push('pages=' + encodeURIComponentForQuery(identifier));
                params_.push('pos=' + pageLocal); //1-based
            } else if (manifestUrl) {
                if (isTimelineMode) {
                    params_.push('timeline=' + encodeURIComponentForQuery(manifestUrl));
                    if (getCanvasCursorIndex(page) !== null) {
                        params_.push('cursorIndex=' + getCanvasCursorIndex(page));
                    }
                } else {
                    params_.push('manifest=' + encodeURIComponentForQuery(manifestUrl));
                    params_.push('pos=' + pageLocal); //1-based
                    if (getBrowsingCurationUrl()) {
                        var fragment = pageInfos[page].fragment;
                        if (fragment) {
                            var match = fragment.match(/xywh=(?:pixel:)?([0-9]+,[0-9]+,[0-9]+,[0-9]+)/); //「percent:」は未対応
                            if (match) {
                                params_.push('xywh=' + match[1]);
                                params_.push('xywh_highlight=border');
                            }
                        }
                    }
                }
            }
            params_.push('lang=' + lng);
            $('#page_orig_nav').show();
            $('#page_orig').attr({ href: '?' + params_.join('&'), title: (lng !== 'ja') ? 'View in original order' : '元資料の並び順で閲覧' });
        } else {
            $('#page_orig_nav').hide();
        }
        var pageOrigText = pageLocal + ' / ' + bookInfos[bookIndex].totalPagesNum;
        $('#page_orig').text(pageOrigText);

        //画像ダウンロードURL
        $('#image_download').attr({ href: getImageDownloadUrl(page), title: (lng !== 'ja') ? 'Download this image' : 'この画像をダウンロード' });

        //キャンバス情報表示
        function getCanvasLinkUrl(page) {
            var manifestUrl = getManifestUrl(page);
            var canvasUrl = getCanvasId(page);
            if (manifestUrl && canvasUrl) {
                var newUrl = location.protocol + '//' + location.host + location.pathname;
                var params_ = [];
                params_.push('manifest=' + encodeURIComponentForQuery(manifestUrl));
                params_.push('canvas=' + encodeURIComponentForQuery(canvasUrl));
                params_.push('lang=' + lng);
                newUrl += '?' + params_.join('&');
                return newUrl;
            } else {
                return null;
            }
        }
        function getCanvasLink(page) {
            var url = getCanvasLinkUrl(page);
            if (url) {
                return $('<a>').attr('href', url).text(url).prop('outerHTML');
            } else {
                return null;
            }
        }
        if (!isTimelineMode) {
            $('#canvas_info_dropdown').attr('title', (lng !== 'ja') ? 'Show the canvas information' : 'このコマの情報を表示');
            var canvasInfoBody = '';
            if (getCanvasLabel(page)) {
                var canvasLabel_ = getPropertyValueI18nAsHtml(getCanvasLabel(page), { allowMinimalHtmlTag: false });
                canvasInfoBody += '<div class="info_elem"><div class="info_elem_label"><span>Canvas Label</span></div>' +
                    '<div class="info_elem_content">' + canvasLabel_ + '</div></div>';
            }
            if (getCanvasDescription(page)) {
                var canvasDescription = getPropertyValueI18nAsHtml(getCanvasDescription(page), { allowMinimalHtmlTag: true });
                canvasInfoBody += '<div class="info_elem"><div class="info_elem_label"><span>Canvas Description</span></div>' +
                    '<div class="info_elem_content">' + canvasDescription + '</div></div>';
            }
            if (getCanvasLinkUrl(page)) {
                canvasInfoBody += '<div class="info_elem"><div class="info_elem_label"><span>Canvas Link</span></div>' +
                    '<div class="info_elem_content">' + getCanvasLink(page) + '</div></div>';
            }
            if ($.isArray(getCanvasMetadata(page))) {
                var manifestCanvasMetadata = getManifestMetadataAsHtml(getCanvasMetadata(page));
                if (manifestCanvasMetadata) {
                    canvasInfoBody += '<div class="info_elem"><div class="info_elem_label"><span>Canvas Metadata</span></div>' +
                        '<div class="info_elem_content">' + manifestCanvasMetadata + '</div></div>';
                }
            }
            if (canvasInfoBody) {
                canvasInfoBody = '<div class="info_body">' + canvasInfoBody + '</div>';
                $('#canvas_info_list').html(canvasInfoBody);
                $('#canvas_info_nav').show();
            } else {
                $('#canvas_info_nav').hide();
            }
        } else {
            $('#canvas_info_nav').hide();
        }

        //情報表示
        // Presentation API 2.1
        //  Language: 'label', 'description', 'attribution' and the 'label' and 'value' fields of the 'metadata'
        //  HTML Markup: 'description', 'attribution' and 'metadata', must not be used in 'label' or other properties.
        // Presentation API 3.0
        //  Language: 'label', 'summary' and the 'label' and 'value' fields of the 'metadata' and 'requiredStatement'
        //  HTML Markup: 'summary' and 'value' property in the 'metadata' and 'requiredStatement', must not be used in 'label' or other properties.
        $('#info_dropdown').attr('title', (lng !== 'ja') ? 'Show the manifest information' : 'この資料の情報を表示');
        var infoBody = '<div class="info_body">';
        // Descriptive Properties
        if (manifest.label) {
            var manifestLabel_ = getPropertyValueI18nAsHtml(manifest.label, { allowMinimalHtmlTag: false });
            infoBody += '<div class="info_elem"><div class="info_elem_label"><span>Label</span></div>' +
                '<div class="info_elem_content">' + manifestLabel_ + '</div></div>';
        }
        if (manifest.description) {
            var description = getPropertyValueI18nAsHtml(manifest.description, { allowMinimalHtmlTag: true });
            infoBody += '<div class="info_elem"><div class="info_elem_label"><span>Description</span></div>' +
                '<div class="info_elem_content">' + description + '</div></div>';
        }
        // Rights and Licensing Properties
        if (manifest.attribution) {
            var attribution = getPropertyValueI18nAsHtml(manifest.attribution, { allowMinimalHtmlTag: true });
            infoBody += '<div class="info_elem"><div class="info_elem_label"><span>Attribution</span></div>' +
                '<div class="info_elem_content">' + attribution + '</div></div>';
        }
        if (manifest.license) {
            var license = $('<span>').text(manifest.license).prop('outerHTML');
            infoBody += '<div class="info_elem"><div class="info_elem_label"><span>License</span></div>' +
                '<div class="info_elem_content">' + license + '</div></div>';
        }
        if (manifest.logo) {
            var logoUrls = getUriRepresentations(manifest.logo);
            if ($.isArray(logoUrls) && logoUrls.length > 0) {
                infoBody += '<div class="info_elem"><div class="info_elem_label"><span>Logo</span></div>';
                for (i = 0; i < logoUrls.length; i++) {
                    var logo = $('<img>').attr('src', logoUrls[i]).attr('alt', 'logo').addClass('info_logo').prop('outerHTML');
                    infoBody += logo;
                }
                infoBody += '</div>';
            }
        }
        // Manifest URL
        if (manifestUrl) {
            var manifestShareUrl = getManifestShareAsHtml(manifestUrl);
            if (manifestShareUrl) {
                infoBody += '<div class="info_elem"><div class="info_elem_label"><span>IIIF Manifest URI</span></div>' +
                    '<div class="info_elem_content">' + manifestShareUrl + '</div></div>';
            }
        }
        // Metadata
        // メタデータはDescriptive Propertiesのグループだが、長くなることもあるので、末尾に表示する
        if ($.isArray(manifest.metadata)) {
            var manifestMetadata = getManifestMetadataAsHtml(manifest.metadata);
            if (manifestMetadata) {
                infoBody += '<div class="info_elem"><div class="info_elem_label"><span>Metadata</span></div>' +
                    '<div class="info_elem_content">' + manifestMetadata + '</div></div>';
            }
        }
        infoBody += '</div>';
        $('#info_list').html(infoBody);

        // navDate and navPlace
        $('#nav_dropdown').attr('title', (lng !== 'ja') ? 'Show the manifest navigation information' : 'この資料のナビゲーション情報を表示');
        var navDateContents = '';
        var navPlaceContents = '';
        if (manifest.navDate) {
            var navDate = $('<span>').text(manifest.navDate).prop('outerHTML');
            navDateContents = '<div class="info_elem"><div class="info_elem_label"><span>navDate</span></div>' +
                '<div class="info_elem_content">' + navDate + '</div></div>';
        }
        if (manifest.navPlace) {
            var navPlace = getNavPlaceAsHtml(manifest.navPlace);
            if (navPlace) {
                navPlaceContents = '<div class="info_elem"><div class="info_elem_label"><span>navPlace</span></div>' +
                '<div class="info_elem_content">' + navPlace + '</div></div>';
            }
        }
        if (navDateContents || navPlaceContents) {
            $('#nav_list').html('<div class="info_body">' + navDateContents + navPlaceContents + '</div>');
            $('#nav_nav').show();
            if (navPlaceContents) {
                // #navPlace_features_carousel は getNavPlaceAsHtml()で毎回作り直されるので .off()不要
                $('#navPlace_features_carousel .carousel-control-custom').on('click', function () {
                    var $this = $(this);
                    var carousel = $this.attr('data-target');
                    if (carousel) {
                        if ($this.hasClass('carousel-control-left')) {
                            $(carousel).carousel('prev');
                        } else if ($this.hasClass('carousel-control-right')) {
                            $(carousel).carousel('next');
                        }
                    }
                });
                $('#navPlace_features_carousel').on('slid.bs.carousel', function () {
                    updateNavPlaceFeaturesControls(this);
                    if (manifest) {
                        var $activeItem = $(this).find('.item.active');
                        var featureIndex = parseInt($activeItem.attr('data-feature-index') || 0, 10);
                        showNavPlaceMap(manifest.navPlace, featureIndex);
                    }
                });
                updateNavPlaceFeaturesControls('#navPlace_features_carousel');

                // 地図表示用Leafletが表示状態になってから内容更新
                $('#nav_nav > .dropdown').off('.setupNavigations'); //.off()必要
                $('#nav_nav > .dropdown').on('shown.bs.dropdown.setupNavigations', function () {
                    if (manifest) {
                        showNavPlaceMap(manifest.navPlace);
                    }
                });
                if ($('#nav_nav > .dropdown').hasClass('open')) {
                    //ドロップダウンを開いた状態でキーボードショートカットを用いて前後コマに移動した場合、
                    //ドロップダウンは開かれた状態のままとなる。
                    //（前後移動ボタン用いてコマ移動した場合は、ドロップダウンは閉じられる。）
                    if (manifest) {
                        showNavPlaceMap(manifest.navPlace);
                    }
                }
                // #navPlaceMaps_select は getNavPlaceAsHtml()で毎回作り直されるので .off()不要
                $('#navPlaceMaps_select').on('change', function() {
                    if (manifest) {
                        navPlaceMapsSelectedIndex = parseInt($(this).val() || 0, 10);
                        var $activeItem = $('#navPlace_features_carousel').find('.item.active');
                        var featureIndex = parseInt($activeItem.attr('data-feature-index') || 0, 10);
                        showNavPlaceMap(manifest.navPlace, featureIndex);
                    }
                });
            }
        } else {
            $('#nav_nav').hide();
        }

        //ビューモード切替
        if (getBrowsingCurationUrl() && curation.viewingHint !== 'annotation') {
            var newUrl = getPageLink();
            if (newUrl.indexOf('?') > -1) {
                var search = newUrl.substring(newUrl.indexOf('?'));
                var params__ = getParams(search);
                if (params__) {
                    if (params__.mode === 'annotation') {
                        delete params__.mode;
                        $('#toggle_viewmode_icon').removeClass().addClass('glyphicon glyphicon-scissors');
                        $('#toggle_viewmode').attr('title', (lng !== 'ja') ? 'View in Curation Mode' : 'キュレーションビューモードで閲覧');
                    } else {
                        params__.mode = 'annotation';
                        $('#toggle_viewmode_icon').removeClass().addClass('glyphicon glyphicon-comment');
                        $('#toggle_viewmode').attr('title', (lng !== 'ja') ? 'View in Annotation Mode' : 'アノテーションビューモードで閲覧');
                    }
                    //アノテーションビューでのコマ番号と、キュレーションビューでのコマ番号は一致しない
                    delete params__.pos;
                }
                newUrl = L.Util.getParamString(params__);
            }
            $('#toggle_viewmode').attr('href', newUrl);
            $('#viewmode_nav').show();
        } else {
            $('#viewmode_nav').hide();
        }

        //キュレーションリスト登録の状態
        if (getFavState()) {
            $('#fav_star').removeClass('glyphicon-star-empty').addClass('glyphicon-star');
            $('#fav_star_link').attr('title', (lng !== 'ja') ? 'Remove this page from the list' : 'このコマをリストから削除');
        } else {
            $('#fav_star').removeClass('glyphicon-star').addClass('glyphicon-star-empty');
            $('#fav_star_link').attr('title', (lng !== 'ja') ? 'Add this page into the list' : 'このコマをリストに登録');
        }

        //表示言語切り替え
        if ($('.nav_lang_ja').length && $('.nav_lang_en').length) {
            if (lng !== 'ja') {
                var $ja = $('<a>').attr('href', getPageLink('ja')).text('日本語');
                $('.nav_lang_ja').html($ja);
                $('.nav_lang_en').text('English');
            } else {
                var $en = $('<a>').attr('href', getPageLink('en')).text('English');
                $('.nav_lang_ja').text('日本語');
                $('.nav_lang_en').html($en);
            }
        }
    }
    function getPrevPageStepLabel(pageSteplabel) {
        var prevPageStepLabel;
        if (isTimelineMode && !isFilteredContents) {
            prevPageStepLabel = (lng !== 'ja') ? '-' + pageSteplabel : '«' + pageSteplabel + '前';
        } else {
            prevPageStepLabel = (lng !== 'ja') ? '«' + pageSteplabel : '«' + pageSteplabel + '前';
        }
        return prevPageStepLabel;
    }
    function getNextPageStepLabel(pageSteplabel) {
        var nextPageStepLabel;
        if (isTimelineMode && !isFilteredContents) {
            nextPageStepLabel = (lng !== 'ja') ? '+' + pageSteplabel : pageSteplabel + '後»';
        } else {
            nextPageStepLabel = (lng !== 'ja') ? pageSteplabel + '»' : pageSteplabel + '次»';
        }
        return nextPageStepLabel;
    }
    function getTimeExpression(seconde) {
        var result;
        if (seconde < 60) {
            result = String(seconde) + ((lng !== 'ja') ? 's' : '秒');
        } else if (seconde < 3600) {
            result = String(seconde / 60) + ((lng !== 'ja') ? 'min' : '分');
        } else if (seconde < 86400) {
            result = String(seconde / 3600) + ((lng !== 'ja') ? 'h' : '時間');
        } else {
            result = String(seconde / 86400) + ((lng !== 'ja') ? 'd' : '日');
        }
        return result;
    }
    function getPageStepExpression(step) {
        if (step === 1) {
            return '';
        } else {
            return String(step) + ((lng !== 'ja') ? 'p' : 'コマ');
        }
    }

    function onNextPage() {
        var nextPage = page + pageStep;
        var outRange = 0;
        if (nextPage > pageInfos.length - 1) {
            outRange = nextPage - pageInfos.length;
            nextPage = 0;
        }
        if (isTimelineMode && !isFilteredContents && nextPage === 0) {
            var canvasId = getCanvasId(page);
            var cursorNextUrl;
            if (cursorInfo.next !== null) {
                cursorNextUrl = getCursorUrl(cursorInfo.endpointUrl, cursorInfo.next);
                if (cursorNextUrl) {
                    processCursorUrl(cursorNextUrl, { refCanvasId: canvasId, direction: 'next', outRange: outRange, resetInfos: true });
                }
            } else if (cursorInfo.status === 'updating') {
                //nextプロパティが未設定の場合、timeline.jsonが更新されて、より新しいCanvasが利用可能になっていないか確認する。
                var timelineUrl = getManifestUrl(page);
                cursorNextUrl = getCursorUrl(cursorInfo.endpointUrl, cursorInfo.index);
                if (timelineUrl && cursorNextUrl) {
                    $.getJSON(timelineUrl, function(timeline) {
                        if (isValidTimelineFalseTrue(timeline)) {
                            var cursor = timeline.cursors[0];
                            cursorInfo.first = getCursorIndexFromProp(cursor.first);
                            cursorInfo.last = getCursorIndexFromProp(cursor.last);
                            processCursorUrl(cursorNextUrl, { refCanvasId: canvasId, direction: 'next', outRange: outRange, resetInfos: true });
                        }
                    }).fail(function(jqxhr, textStatus, error) {
                        err = new Error(); showError(ICV_ERROR.DOWNLOAD_FAIL, err.lineNumber, textStatus + ', ' + error); //jsonの取得に失敗(timeline)
                    });
                }
            }
            return;
        }
        page = nextPage;
        refreshPage();
    }
    function onPrevPage() {
        var prevPage = page - pageStep;
        var outRange = -1;
        if (prevPage < 0) {
            outRange = prevPage;
            prevPage = pageInfos.length - 1;
            if (prevPage < 0) {
                prevPage = 0;
            }
        }
        if (isTimelineMode && !isFilteredContents && prevPage === pageInfos.length - 1) {
            if (cursorInfo.prev !== null) {
                var canvasId = getCanvasId(page);
                var cursorPrevUrl = getCursorUrl(cursorInfo.endpointUrl, cursorInfo.prev);
                if (cursorPrevUrl) {
                    processCursorUrl(cursorPrevUrl, { refCanvasId: canvasId, direction: 'prev', outRange: outRange, resetInfos: true });
                }
            }
            return;
        }
        page = prevPage;
        refreshPage();
    }

    function onNextBook() {
        var idx = $.inArray(page, bookChangePages);
        if (idx >= 0) {
            idx++;
            if (idx > bookChangePages.length - 1) {
                idx = 0;
            }
        } else {
            for (var i = 0; i < bookChangePages.length; i++) {
                if (bookChangePages[i] > page) {
                    idx = i;
                    break;
                }
            }
            if (idx < 0) {
                idx = 0;
            }
        }
        page = bookChangePages[idx];
        refreshPage();
    }
    function onPrevBook() {
        var idx = $.inArray(page, bookChangePages);
        if (idx >= 0) {
            idx--;
            if (idx < 0) {
                idx = bookChangePages.length - 1;
            }
        } else {
            for (var i = 0; i < bookChangePages.length; i++) {
                if (bookChangePages[i] > page) {
                    idx = i - 1;
                    break;
                }
            }
            if (idx < 0) {
                idx = bookChangePages.length - 1;
            }
        }
        if (idx < 0) {
            idx = 0;
        }
        page = bookChangePages[idx];
        refreshPage();
    }

    function gotoPage(obj) { //obj: number (1-based) or HTMLSelectElement
        hideThumbnails();
        if (String(obj).match(/^[0-9]+$/)) {
            var num = parseInt(obj, 10) - 1; //1-based to 0-based
            if (num < 0) {
                num = 0;
            } else if (num > pageInfos.length - 1) {
                num = 0;
            }
            page = num;
            refreshPage();
        } else if (Object.prototype.toString.call(obj) === '[object HTMLSelectElement]') {
            gotoPage($(obj).val());
        }
    }

    function gotoLatest() {
        if (isTimelineMode && !isFilteredContents && cursorInfo.status === 'updating') {
            //Timelineを再取得し、そのlastへ移動する
            var timelineUrl = getManifestUrl(page);
            if (timelineUrl) {
                $.getJSON(timelineUrl, function(timeline) {
                    if (isValidTimelineFalseTrue(timeline)) {
                        var cursor = timeline.cursors[0];
                        cursorInfo.first = getCursorIndexFromProp(cursor.first);
                        cursorInfo.last = getCursorIndexFromProp(cursor.last);
                        var cursorUrl = getCursorUrl(cursorInfo.endpointUrl, cursorInfo.last);
                        if (cursorUrl) {
                            cursorInfo.index = cursorInfo.last;
                            processCursorUrl(cursorUrl, { outRange: -1, resetInfos: true }); //posは最後のコマへ
                        } else {
                            err = new Error(); showError(ICV_ERROR.NO_ERROR, err.lineNumber); //プロパティ記載異常（最新に移動できなくても致命的ではないのでナビゲージョン不可とはしない）
                        }
                    }
                }).fail(function(jqxhr, textStatus, error) {
                    err = new Error(); showError(ICV_ERROR.NO_ERROR, err.lineNumber, textStatus + ', ' + error); //jsonの取得に失敗(timeline)（最新に移動できなくても致命的ではないのでナビゲージョン不可とはしない）
                });
            }
        }
    }

    function decreaseStep() {
        var steps = isTimelineMode ? conf.timeline.steps : conf.manifest.steps;
        if (!$.isArray(steps) || steps.length === 0) { return; }
        var idx = $.inArray(pageStep, steps);
        if (idx > 0) {
            pageStep = steps[idx - 1];
            setupNavigations();
        }
    }
    function increaseStep() {
        var steps = isTimelineMode ? conf.timeline.steps : conf.manifest.steps;
        if (!$.isArray(steps) || steps.length === 0) { return; }
        var idx = $.inArray(pageStep, steps);
        if (idx > -1 && idx < steps.length - 1) {
            pageStep = steps[idx + 1];
            setupNavigations();
        }
    }

    function updateHistory() {
        if (history.replaceState && history.state !== undefined) {
            var newUrl = getPageLink();
            history.replaceState(null, document.title, newUrl);
        }
    }
    function getPageLink(lang) {
        var localLang = lang || lng;
        var newUrl = location.protocol + '//' + location.host + location.pathname;
        var params_ = [];
        //表示対象指定
        if ('pages' in params) {
            params_.push('pages=' + encodeURIComponentForQuery(params.pages));
        } else if ('curation' in params) {
            params_.push('curation=' + encodeURIComponentForQuery(params.curation));
            if (params.mode) {
                params_.push('mode=' + encodeURIComponentForQuery(params.mode));
            }
        } else if ('manifest' in params) {
            params_.push('manifest=' + encodeURIComponentForQuery(params.manifest));
        } else if ('timeline' in params) {
            params_.push('timeline=' + encodeURIComponentForQuery(params.timeline));
            if (cursorInfo.index !== null) {
                params_.push('cursorIndex=' + cursorInfo.index);
            }
        } else if ('iiif-content' in params) {
            params_.push('iiif-content=' + encodeURIComponentForQuery(params['iiif-content']));
        }
        //表示ページ指定
        if (page > 0) {
            params_.push('pos=' + String(page + 1));  //0-based to 1-based
        }
        //表示言語指定
        params_.push('lang=' + localLang);
        //キュレーションラベル指定
        if ('label' in params && !('curation' in params)) {
            params_.push('label=' + encodeURIComponent(params.label));
        }
        if (params_.length > 0) {
            newUrl += '?' + params_.join('&');
        }
        return newUrl;
    }
    function encodeURIComponentForQuery(str) {
        //encodeURIComponentでエスケープされる文字の一部をアンエスケープする
        /*
            URI           = scheme ":" hier-part [ "?" query ] [ "#" fragment ]
            query         = *( pchar / "/" / "?" )
            pchar         = unreserved / pct-encoded / sub-delims / ":" / "@"
            unreserved    = ALPHA / DIGIT / "-" / "." / "_" / "~"
            sub-delims    = "!" / "$" / "&" / "'" / "(" / ")" / "*" / "+" / "," / ";" / "="
            https://www.ietf.org/rfc/rfc3986.txt
        */
        //query部分では、":", "@", "/", "?" と sub-delimsは許されている
        //可読性のため、ここでは ":", "/", "," はアンエスケープする
        var result = encodeURIComponent(str).replace(/%(?:3A|2F|2C)/g, function(c) {
            return decodeURIComponent(c);
        });
        return result;
    }
    function getAbsoluteUrl(url) {
        var anchor = document.createElement('a');
        anchor.href = url;
        return anchor.href;
    }
    function getAbsoluteUrlModern(url, base) {
        //IEは動作対象外
        try {
            return new URL(url, base).href;
        } catch(e) {
            return getAbsoluteUrl(url);
        }
    }
    //エラー表示
    function showError(errtype, lineNumber, message) {
        $('#page_navigation').hide();
        var msg;
        switch (errtype) {
        case ICV_ERROR.DOWNLOAD_FAIL:
            msg = (lng !== 'ja') ? 'Unable to download IIIF data' : 'IIIFデータを取得できませんでした';
            break;
        case ICV_ERROR.UNSUPPORTED_VERSION:
            msg = (lng !== 'ja') ? 'Unsupported version of IIIF data' : '対応していないバージョンのIIIFデータです';
            break;
        case ICV_ERROR.INCORRECT_DATA:
            msg = (lng !== 'ja') ? 'Incorrect IIIF data' : 'IIIFデータに問題があります';
            break;
        case ICV_ERROR.WEB_STORAGE:
            msg = ''; //フィードバック不要
            break;
        }
        if (msg) {
            $('#book_title').html('<div class="alert alert-warning">' + msg + '</div>');
        }
        if (errtype && window.console) {
            var msg_ = APP_NAME + ' Error';
            var details = [];
            if (lineNumber) {  //行番号を取得できるのはFirefoxのみ
                details.push('line: ' + lineNumber);
            }
            if (msg) {
                details.push(msg);
            }
            if (message) {
                details.push(message);
            }
            if (details.length > 0) {
                msg_ += ' (' + details.join(', ') + ')';
            }
            console.log(msg_); // eslint-disable-line no-console
        }
    }

    //----------------------------------------------------------------------
    //modal表示関係
    var extraSubWindows = {};
    function resetSubWindows(optCallback) {
        //modal表示を解除した後で実行する処理を optCallback で指定する
        var needNotWait = false;
        if (isFullscreen()) {
            exitFullscreen();
            needNotWait = true;
        } else {
            $.each(extraSubWindows, function(key, callback) {
                if ($.isFunction(callback)) {
                    callback();
                }
            });
            var $dropdowns = $('.dropdown-menu:visible');
            if ($dropdowns.length) {
                $dropdowns.each(function() {
                    $(this).dropdown('toggle');
                });
            }
            //$('.modal:visible')では、.modal('show')が呼ばれてから実際に表示されるまでの過程にあるものは選択から漏れる。
            var $modals = $('.modal').filter(function() { return ($(this).data('bs.modal') || {isShown: false}).isShown; });
            if ($modals.length) {
                $modals.each(function() {
                    $(this).one('hidden.bs.modal', function() {
                        var $modalVisible = $('.modal').filter(function() { return ($(this).data('bs.modal') || {isShown: false}).isShown; });
                        if (optCallback && $.isFunction(optCallback) && $modalVisible.length === 0) {
                            optCallback();
                        }
                    });
                    $(this).modal('hide');
                });
            } else {
                needNotWait = true;
            }
        }
        if (optCallback && $.isFunction(optCallback) && needNotWait) {
            optCallback();
        }
    }
    function registerSubWindow(callback) {
        if (callback && $.isFunction(callback)) {
            var key = new Date().getTime().toString(16) + Math.floor(Math.random() * 0x1000).toString(16);
            extraSubWindows[key] = callback;
            return key;
        }
        return;
    }
    function unregisterSubWindow(key) {
        if (key) {
            delete extraSubWindows[key];
        }
    }
    //フルスクリーン表示
    function viewFullscreen() {
        if (!isFullscreen()) {
            toggleFullscreen();
        }
    }
    function exitFullscreen() {
        if (isFullscreen()) {
            toggleFullscreen();
        }
    }
    function toggleFullscreen() {
        if (map !== undefined) {
            if (!isFullscreen()) {
                resetSubWindows(); //高速に切り替えたいのでcallbackは使わない
            }
            map.toggleFullscreen({ pseudoFullscreen: true });
        }
    }
    function isFullscreen() {
        return map !== undefined && map.isFullscreen();
    }
    //サムネイル一覧表示
    function showThumbnails() {
        if (isThumbnailsHidden()) {
            toggleThumbnails();
        }
    }
    function hideThumbnails() {
        if (!isThumbnailsHidden()) {
            toggleThumbnails();
        }
    }
    function toggleThumbnails() {
        if (isThumbnailsHidden()) {
            resetSubWindows(function() { $('#thumbnails_win').modal('toggle'); });
        } else {
            resetSubWindows();
        }
    }
    function isThumbnailsHidden() {
        return $('#thumbnails_win').is(':hidden');
    }
    //情報表示
    function showInfo() {
        if (isInfoHidden()) {
            toggleInfo();
        }
    }
    function hideInfo() {
        if (!isInfoHidden()) {
            toggleInfo();
        }
    }
    function toggleInfo() {
        if (isInfoHidden()) {
            resetSubWindows(function() { $('#info_dropdown').dropdown('toggle'); });
        } else {
            resetSubWindows();
        }
    }
    function isInfoHidden() {
        return $('#info_list').is(':hidden');
    }
    //ヘルプ表示
    function showHelp() {
        if (isHelpHidden()) {
            toggleHelp();
        }
    }
    function hideHelp() {
        if (!isHelpHidden()) {
            toggleHelp();
        }
    }
    function toggleHelp() {
        if (isHelpHidden()) {
            resetSubWindows(function() { $('#help_win').modal('toggle'); });
        } else {
            resetSubWindows();
        }
    }
    function isHelpHidden() {
        return $('#help_win').is(':hidden');
    }
    function getHelp() {
        var html;
        if (lng !== 'ja') {
            html = '<table class="table">' +
                   '<thead><tr><th>Keyboard</th><th>Function</th></tr></thead>' +
                   '<tbody>' +
                   '<tr><td>Right arrow</td><td>Manifest: go to the next or previous frame depending on the manifest settings<br>Curation: go to the next frame<br>Thumbnails: go to the next page</td></tr>' +
                   '<tr><td>Left arrow</td><td>Manifest: go to the previous or next frame depending on the manifest settings<br>Curation: go to the previous frame<br>Thumbnails: go to the previous page</td></tr>' +
                   '<tr><td>Space</td><td>Go to the next frame</td></tr>' +
                   '<tr><td>Back space</td><td>Go to the previous frame</td></tr>' +
                   '<tr><td>f</td><td>Toggle fullscreen</td></tr>' +
                   '<tr><td>t</td><td>Show/hide thumbnails</td></tr>';
            if (enableCurationEdit) {
                html +=
                   '<tr><td>c</td><td>Show/hide the curation list</td></tr>' +
                   '<tr><td>l (small letter L)</td><td>Add to/remove from the curation list</td></tr>';
            }
            html +='<tr><td>+ (Numpad)</td><td>Zoom in</td></tr>' +
                   '<tr><td>- (Numpad)</td><td>Zoom out</td></tr>' +
                   '</tbody>' +
                   '</table>';
        } else {
            html = '<table class="table">' +
                   '<thead><tr><th>キーボード操作</th><th>動作</th></tr></thead>' +
                   '<tbody>' +
                   '<tr><td>右矢印</td><td>マニフェスト：次のコマまたは前のコマへ移動（マニフェスト設定による）<br>キュレーション：次のコマへ移動<br>サムネイル一覧では、次のページへ移動</td></tr>' +
                   '<tr><td>左矢印</td><td>マニフェスト：前のコマまたは次のコマへ移動（マニフェスト設定による）<br>キュレーション：前のコマへ移動<br>サムネイル一覧では、前のページへ移動</td></tr>' +
                   '<tr><td>Space</td><td>次のコマへ移動</td></tr>' +
                   '<tr><td>Back space</td><td>前のコマへ移動</td></tr>' +
                   '<tr><td>f</td><td>フルページ表示切り替え</td></tr>' +
                   '<tr><td>t</td><td>サムネイル一覧表示／非表示切り替え</td></tr>';
            if (enableCurationEdit) {
                html +=
                   '<tr><td>c</td><td>キュレーションリスト表示／非表示切り替え</td></tr>' +
                   '<tr><td>l（小文字エル）</td><td>キュレーションリスト登録／解除切り替え</td></tr>';
            }
            html +='<tr><td>+ (Numpad)</td><td>ズームイン</td></tr>' +
                   '<tr><td>- (Numpad)</td><td>ズームアウト</td></tr>' +
                   '</tbody>' +
                   '</table>';
        }
        return html;
    }
    //キュレーションリスト表示
    function showCurationList() {
        if (isCurationListHidden()) {
            toggleCurationList();
        }
    }
    function hideCurationList() {
        if (!isCurationListHidden()) {
            toggleCurationList();
        }
    }
    function toggleCurationList() {
        if (isCurationListHidden()) {
            resetSubWindows(function() {
                if (storage) {
                    var favsNum = getFavs().length;
                    var FAVS_NUM_TO_SHOW_SPIN = 500;
                    if (favsNum > FAVS_NUM_TO_SHOW_SPIN) {
                        $('#show_curation_list').spin(true);
                    }
                }
                setTimeout(function() {
                    showCurationListCore();
                    $('#show_curation_list').spin(false);
                }, 0);
            });
        } else {
            resetSubWindows();
        }
    }
    function isCurationListHidden() {
        return $('#curation_list_win').is(':hidden');
    }
    //description表示
    function showDescription(target) {
        resetSubWindows(function() { showDescriptionCore(target); });
    }
    function showDescriptionCore(target_) {
        var target = target_ || getBrowsingCurationJson() || {};
        var label = getPropertyValueI18n(target.label);
        var description = (target.description) ? getPropertyValueI18nAsHtml(target.description, { allowMinimalHtmlTag: true }) : '';
        $('#description_title').text(label);
        $('#description_contents').html(description).attr({ 'data-description-target-type': target['@type'] });
        $('#description_win').modal('show');
    }
    function isDescriptionHidden() {
        return $('#description_win').is(':hidden');
    }

    //----------------------------------------------------------------------
    //キュレーションリスト登録関係
    //・curationパラメータで外部キュレーションが指定され、その内容を表示するとき、
    //  sessionStorageへ外部キュレーション内容を格納する。
    //・sessionStorageにキュレーション内容が格納されていれば sessionStorageの内容を、
    //  格納されていなければ localStorageの内容を、キュレーションリスト画面の編集対象とする。
    function getFavs() {
        var favs;
        //sessionStorageにキュレーションデータがあれば、そちらを優先し、
        //なければ localStorageのキュレーションデータを返す。
        if (storageSession) {
            try {
                favs = JSON.parse(storageSession.getItem('favs'));
            } catch (e) {
                try {
                    favs = JSON.parse(LZString.decompressFromUTF16(storageSession.getItem('favs')));
                } catch (e) {
                    //console.log(e);
                }
            }
        }
        if (!favs) {
            if (storage) {
                favs = JSON.parse(storage.getItem('favs'));
            }
        }
        return favs || [];
    }
    function setFavs(favs, optForceUseSessionStorage) { //optForceSessionStorage: 省略可能
        if (storageSession) {
            var hasCurationData;
            if (storageSession.getItem('favsCompressed') === 'true') {
                try {
                    hasCurationData = JSON.parse(LZString.decompressFromUTF16(storageSession.getItem('favs')));
                } catch (e) {
                    //console.log(e);
                }
            } else {
                try {
                    hasCurationData = JSON.parse(storageSession.getItem('favs'));
                } catch (e) {
                    //console.log(e);
                }
            }
            if (optForceUseSessionStorage || hasCurationData) {
                //明示的に sessionStorage利用を指定された場合、または sessionStorageに
                //キュレーションデータがある場合
                if (optForceUseSessionStorage) {
                    try {
                        storageSession.setItem('curationUrl', getBrowsingCurationUrl());
                    } catch (e) {
                        enableCurationEdit = false;
                        err = new Error(); showError(ICV_ERROR.WEB_STORAGE, err.lineNumber, e);
                    }
                }
                try {
                    storageSession.setItem('favs', JSON.stringify(favs));
                    storageSession.setItem('favsCompressed', 'false');
                } catch (e) {
                    try {
                        storageSession.setItem('favs', LZString.compressToUTF16(JSON.stringify(favs)));
                        storageSession.setItem('favsCompressed', 'true');
                    } catch (e) {
                        enableCurationEdit = false;
                        err = new Error(); showError(ICV_ERROR.WEB_STORAGE, err.lineNumber, e);
                    }
                }
                return;
            }
        }
        if (storage) {
            try {
                storage.setItem('favs', JSON.stringify(favs));
            } catch (e) {
                err = new Error(); showError(ICV_ERROR.WEB_STORAGE, err.lineNumber, e);
            }
        }
    }
    function removeFavs() {
        if (storageSession) {
            if (storageSession.getItem('favsCompressed') === 'true') {
                try {
                    if (JSON.parse(LZString.decompressFromUTF16(storageSession.getItem('favs')))) {
                        storageSession.removeItem('favs');
                        storageSession.removeItem('favsCompressed');
                        return;
                    }
                } catch (e) {
                    //console.log(e);
                }
            } else {
                try {
                    if (JSON.parse(storageSession.getItem('favs'))) {
                        storageSession.removeItem('favs');
                        storageSession.removeItem('favsCompressed');
                        return;
                    }
                } catch (e) {
                    //console.log(e);
                }
            }
        }
        if (storage) {
            storage.removeItem('favs');
        }
    }
    function getFavState() {
        return getFavIndex() > -1;
    }
    function getFavIndex() {
        if (storage) {
            var fav = makeFav(page);
            var favData = getFavs();
            for (var i = 0; i < favData.length; i++) {
                if (favData[i] && fav &&
                    favData[i].manifestUrl === fav.manifestUrl &&
                    favData[i].canvasId === fav.canvasId &&
                    favData[i].fragment === fav.fragment) {
                    if (favData[i].indexInBrowsingCuration) {
                        if (favData[i].indexInBrowsingCuration === String(page + 1)) {
                            return i;
                        }
                    } else {
                        return i;
                    }
                }
            }
        }
        return -1;
    }
    function toggleFav() {
        if (storage) {
            var favData = getFavs();
            var idx = getFavIndex();
            if (idx > -1) {
                //削除
                favData.splice(idx, 1);
            } else {
                //追加
                var options;
                if (getBrowsingCurationUrl()) {
                    var metadata = getCanvasMetadataFromCuration(getBrowsingCurationJson());
                    if (metadata.length === pageInfos.length) {
                        var metadatum = metadata[page];
                        options = {
                            indexInBrowsingCuration: String(page + 1), //1-based
                            metadata: metadatum.metadata,
                            description: metadatum.description,
                            durationHint: metadatum.durationHint,
                        };
                    }
                }
                var fav = makeFav(page, options);
                favData.push(fav);
            }
            setFavs(favData);
            setupNavigations();
        }
    }
    function makeFav(page_, options) {
        var bookIndex = pageInfos[page_].bookIndex;
        var pageLocal = pageInfos[page_].pageLocal;
        var fragment  = pageInfos[page_].cropFragment || pageInfos[page_].fragment;
        var manifestUrl   = bookInfos[bookIndex].manifestUrl;
        var manifestLabel = bookInfos[bookIndex].manifest.label;
        var canvasInfoUrl = getCanvasImageInfoUrl(page_);
        var canvasId      = getCanvasId(page_);
        var canvasIndex   = getCanvasCursorIndex(page_);
        var canvasLabel   = getCanvasLabel(page_);
        var canvasThumbnail = getThumbnailUrl(page_, getRegeionFromFragment(fragment), 100, 90);
        var fav = {
            manifestUrl   : manifestUrl,
            manifestLabel : manifestLabel,
            canvas        : canvasInfoUrl, //info.jsonのURL
            canvasId      : canvasId,
            canvasIndex   : canvasIndex, //cursorIndex
            canvasLabel   : canvasLabel,
            canvasThumbnail : canvasThumbnail, //サムネイルのURL
            pageLocal     : pageLocal,
            fragment      : fragment
        };
        if (options) {
            if (options.indexInBrowsingCuration) { //1-based
                fav.indexInBrowsingCuration = options.indexInBrowsingCuration;
            }
            if (options.metadata) {
                fav.metadata = options.metadata;
            }
            if (options.description) {
                fav.description = options.description;
            }
            if (options.durationHint) {
                fav.durationHint = options.durationHint;
            }
        }
        return fav;
    }
    function getEditingCurationUrl() {
        var curationUrl;
        if (storageSession) {
            curationUrl = storageSession.getItem('curationUrl');
        }
        return curationUrl || '';
    }
    //キュレーションリスト画面関係
    function showCurationListCore() {
        if (storage) {
            var favData = getFavs();
            var contents = '';
            var enableEdit = true; //登録件数やstorage状況に応じた機能制限を視野に
            if (isBorderMarkerEditingEnabled()) {
                enableEdit = false;
            }
            for (var i = 0; i < favData.length; i++) {
                if (favData[i]) {
                    var fav = favData[i];
                    var region = getRegeionFromFragment(fav.fragment);
                    var miniThumbnailUrl = fav.canvasThumbnail || fav.canvas.replace('/info.json', '/' + region + '/!100,90/0/default.jpg');
                    miniThumbnailUrl = miniThumbnailUrl.replace(/[(), '"]/g, '\\$&'); //https://www.w3.org/TR/CSS1/#url
                    var $removeButton = $('<button>').attr('type', 'button').addClass('close curation_list_li_close').html('&#0215');
                    var label = getPropertyValueI18n(fav.manifestLabel) + '/' + fav.pageLocal;
                    var $label = $('<div>').addClass('curation_list_li_content_label').text(label);
                    var $div = $('<div>').addClass('curation_list_li_content');
                    var $image = null;
                    if (!fav.canvas) {
                        //IIIF Image API非対応リソース
                        $image = getPsuedoIIIFThumbnailInCurationList($('<img>').attr({ src: miniThumbnailUrl, alt: label, title: label }), fav.fragment);
                    }
                    if ($image) {
                        $div.append($image);
                    } else {
                        $div.css('background-image', 'url("' + miniThumbnailUrl + '")').attr('title', label);
                    }
                    var $li = $('<li>').addClass('ui-state-default curation_list_li').attr({ 'data-manifest-url': fav.manifestUrl, 'data-canvas-id': fav.canvasId });
                    if (fav.fragment) {
                        $li.attr('data-fragment', fav.fragment);
                    }
                    if (fav.indexInBrowsingCuration) {
                        $li.attr('data-index-in-browsing-curation', fav.indexInBrowsingCuration);
                    }
                    contents += $li.append(enableEdit ? $div.append($removeButton).append($label) : $div.append($label)).prop('outerHTML');
                }
            }
            $('#curation_list_ul').html(contents);
            $('#curation_list_ul').sortable();
            $('#curation_list_ul').sortable(enableEdit ? 'enable' : 'disable');
            $('.curation_list_li_close').on('click', function() {
                var $li = $(this).closest('li');
                if ($li.length > 0) {
                    $li.fadeOut('fast', function() {
                        $(this).remove();
                        updateCurationListData();
                        updateCurationListItemsNum();
                        updateCurationListUrl();
                        updateCurationListButtons();
                        setupNavigations();
                    });
                }
            });
            updateCurationListItemsNum();
            updateCurationListUrl();
            updateCurationListButtons();
            $('#curation_list_win').modal('show');
        }
    }
    function setupCurationListEvents() {
        $('#curation_list_ul').off('.curationList');
        $('#curation_list_ul').on('sortupdate.curationList', function(/*event, ui*/) {
            updateCurationListData();
            updateCurationListUrl();
        });
        $('#curation_list_clear').off('.curationList');
        $('#curation_list_clear').on('click.curationList', function() {
            if (storage) {
                removeFavs();
            }
            $('#curation_list_win').modal('hide');
            setupNavigations();
        });
        $('#curation_list_json').off('.curationList');
        $('#curation_list_json').on('click.curationList', function() {
            if (storage) {
                var curation = getCurationListJson();
                var blob = new Blob([JSON.stringify(curation, null, '\t')], { type: 'text/plain' });
                var filename = 'curation.json';
                if (window.navigator.msSaveBlob) {
                    window.navigator.msSaveBlob(blob, filename);
                } else if (window.URL.createObjectURL || window.webkitURL.createObjectURL) {
                    var url;
                    if (window.URL.createObjectURL) {
                        url = window.URL.createObjectURL(blob);
                    } else {
                        url = window.webkitURL.createObjectURL(blob);
                    }
                    var anchorElem = document.createElement('a');
                    anchorElem.href = url;
                    anchorElem.download = filename;
                    //anchorElem.tatget = '_blank';
                    document.body.appendChild(anchorElem);
                    anchorElem.click();
                    document.body.removeChild(anchorElem);
                }
            }
        });
        $('#curation_list_export').off('.curationList');
        $('#curation_list_export').on('click.curationList', function() {
            if (storage && getCurationJsonExport()) {
                var curationJson = getCurationListJson();
                exportCurationJson(curationJson, { method: 'POST' });
            }
        });
    }
    function updateCurationListButtons() {
        if (storage) {
            var favData = getFavs();
            if (favData.length > 0) {
                if (isBorderMarkerEditingEnabled()) {
                    $('#curation_list_clear').hide();
                } else {
                    $('#curation_list_clear').show();
                }
                $('#curation_list_json').show();
                if (getCurationJsonExport()) {
                    $('#curation_list_export').show();
                } else {
                    $('#curation_list_export').hide();
                }
            } else {
                $('#curation_list_clear').hide();
                $('#curation_list_json').hide();
                $('#curation_list_export').hide();
            }
            $(document).trigger('icv.updateCurationListWindow', [favData.length]); //イベント送出
        }
    }
    function updateCurationListData() {
        if (storage) {
            var favData = getFavs();
            var newFavData = [];
            $('#curation_list_ul li').map(function() {
                var $this = $(this);
                var manifestUrl = $this.attr('data-manifest-url');
                var canvasId = $this.attr('data-canvas-id');
                var fragment = $this.attr('data-fragment');
                var indexInBrowsingCuration = $this.attr('data-index-in-browsing-curation');
                for (var i = 0; i < favData.length; i++) {
                    if (favData[i] &&
                        favData[i].manifestUrl === manifestUrl &&
                        favData[i].canvasId === canvasId &&
                        favData[i].fragment === fragment &&
                        favData[i].indexInBrowsingCuration === indexInBrowsingCuration) {
                        newFavData.push(favData[i]);
                        break;
                    }
                }
            });
            setFavs(newFavData);
        }
    }
    function updateCurationListUrl() {
        var newUrl = getCurationListUrl();
        var $newUrlElem;
        if (newUrl) {
            $newUrlElem = $('<a>').attr({ href: newUrl, target: '_blank' }).text(newUrl);
        } else {
            $newUrlElem = $('<div>').html((lng !== 'ja') ? 'No page was added into the list' : '☆ボタンで表示中のコマをリスト登録すると、サムネイルが表示されます。<br>サムネイルはドラッグ＆ドロップで並び替えができます。');
        }
        $('#curation_list_url').html($newUrlElem);
    }
    function updateCurationListItemsNum() {
        var contents = '';
        if (storage) {
            var favsNum = getFavs().length;
            var favsNumStr = formatInteger(favsNum);
            var itemsStr = '';
            if (lng !== 'ja') {
                itemsStr = favsNumStr + ' item' + ((favsNum > 1) ? 's' : '');
            } else {
                itemsStr = '登録件数：' + favsNumStr + '件';
            }
            contents = $('<span>').text(itemsStr).prop('outerHTML');
            /* 登録件数に応じて注意を喚起する場合
            if (some_condition) {
                contents += $('<div>').addClass('alert ' + alertClass + ' curation_list_alert').attr('role', 'alert').text(warnText).prop('outerHTML');
            }
            */
        }
        $('#curation_list_items_num').html(contents);
    }
    function getCurationListUrl() {
        var pages = '';
        var isInvalidUrl = false;
        if (storage) {
            var favData = getFavs();
            var bookId;
            var bookIdPrev;
            var pageLocal;
            var pageLocalPrev;
            for (var i = 0; i < favData.length; i++) {
                if (favData[i]) {
                    var fav = favData[i];
                    bookId = getIdentifierFromManifestUrl(fav.manifestUrl);
                    if (bookId === '' || fav.fragment) {
                        isInvalidUrl = true;
                        break;
                    }
                    pageLocal = fav.pageLocal;
                    if (bookId !== bookIdPrev) {
                        if (pages.length > 0) {
                            pages += ':';
                        }
                        pages += bookId + '/' + pageLocal;
                        bookIdPrev = bookId;
                    } else {
                        if (parseInt(pageLocal, 10) === parseInt(pageLocalPrev, 10) + 1) {
                            var reg = new RegExp('([/,-])' + pageLocalPrev + '$');
                            var match = pages.match(reg);
                            if (match) {
                                if (match[1] === '-') {
                                    pages = pages.replace(new RegExp('-' + pageLocalPrev + '$'), '-' + pageLocal);
                                } else {
                                    pages += '-' + pageLocal;
                                }
                            }
                        } else {
                            pages += ',' + pageLocal;
                        }
                    }
                    pageLocalPrev = pageLocal;
                }
            }
        }
        if (isInvalidUrl) {
            return ' '; //URLでは表現できない
        }
        if (pages) {
            var newUrl = location.protocol + '//' + location.host + location.pathname;
            var params_ = [];
            //表示対象指定
            params_.push('pages=' + encodeURIComponentForQuery(pages));
            //表示言語指定
            params_.push('lang=' + lng);
            if (params_.length > 0) {
                newUrl += '?' + params_.join('&');
            }
            return newUrl;
        } else {
            return '';
        }
    }
    function getCurationListSelections(favData) {
        var selections = [];
        var manifestUrl = '';
        var manifestUrlPrev = '';
        var scRange;
        for (var i = 0; i < favData.length; i++) {
            if (favData[i]) {
                var fav = favData[i];
                manifestUrl = fav.manifestUrl;
                var assumedBaseUrl = manifestUrl.replace(/\/manifest(\.json)?$/i, ''); //よくあるパターンのみ対応
                var manifestLabel = fav.manifestLabel;
                var canvasId = fav.canvasId;
                if (fav.fragment) {
                    canvasId += '#' + fav.fragment;
                }
                var canvasIndex = getCursorIndexFromProp(fav.canvasIndex);
                var canvas = {
                    '@id': canvasId,
                    '@type': (canvasIndex !== null) ? 'cs:Canvas' : 'sc:Canvas', //codh:Canvas
                    'label': fav.canvasLabel
                };
                if (canvasIndex !== null) { //timeline
                    canvas.cursorIndex = canvasIndex;
                }
                if (fav.metadata !== undefined) {
                    canvas.metadata = fav.metadata;
                }
                if (isBorderMarkerEditingEnabled()) {
                    //アノテーションメタデータの圧縮記法に変換されて出力される
                    for (var p = 0; p < pageInfos.length; p++) {
                        if (getCanvasId(p) === canvasId) {
                            var annotations = JSON.parse(JSON.stringify(getCanvasAnnotations(p)));
                            if ($.isArray(annotations)) {
                                for (var n = 0; n < annotations.length; n++) {
                                    annotations[n]['@id'] = fav.canvasId + '/annotation/' + String(i + 1) + '_' + String(n + 1);
                                    if (annotations[n].fragment) {
                                        delete annotations[n].fragment;
                                    }
                                }
                            }
                            var metadatum = {
                                label: 'Annotation',
                                value: annotations
                            };
                            if (canvas.metadata === undefined) {
                                canvas.metadata = [metadatum];
                            } else if ($.isArray(canvas.metadata)) {
                                var foundAnnotationInMetadata = false;
                                for (var m = 0; m < canvas.metadata.length; m++) {
                                    var metadatum_ = canvas.metadata[m];
                                    if (metadatum_ && String(metadatum_.label).toLowerCase() === 'annotation' && $.isArray(metadatum_.value)) {
                                        foundAnnotationInMetadata = true;
                                        canvas.metadata[m] = metadatum;
                                        break;
                                    }
                                }
                                if (!foundAnnotationInMetadata) {
                                    canvas.metadata.push(metadatum);
                                }
                            }
                        }
                    }
                }
                if (fav.description !== undefined) {
                    canvas.description = fav.description;
                } else {
                    canvas.description = ''; //未設定の場合、後日、JSONエディタで修正しやすいように''で項目を生成しておく
                }
                if (fav.durationHint !== undefined) {
                    canvas.durationHint = fav.durationHint;
                }
                if (manifestUrl !== manifestUrlPrev) {
                    scRange = {
                        '@id': assumedBaseUrl + '/range/r' + String(i + 1),
                        '@type': 'sc:Range',
                        'label': 'Manual curation by ' + APP_NAME,
                        'members': [canvas],
                        'within': {
                            '@id': manifestUrl,
                            '@type': (canvasIndex !== null) ? 'tl:Manifest' : 'sc:Manifest', //codh:Manifest
                            'label': manifestLabel
                        }
                    };
                    selections.push(scRange);
                    manifestUrlPrev = manifestUrl;
                } else {
                    if (selections.length > 0) {
                        scRange = selections[selections.length - 1];
                        if (scRange && $.isArray(scRange.members)) {
                            scRange.members.push(canvas);
                        }
                    }
                }
            }
        }
        return selections;
    }
    function getCurationJsonFromFavs(favData) {
        var id = 'http://example.org/iiif/curation/curation.json';
        var label = 'Curation list';
        var selections = getCurationListSelections(favData);
        var codhCuration = {
            '@context': [
                'http://iiif.io/api/presentation/2/context.json',
                CONTEXT_CURATION
            ],
            '@type': 'cr:Curation', //codh:Curation
            '@id': id,
            label: label,
            selections: selections
        };
        return codhCuration;
    }
    function getCurationListJson() {
        var curationJson;
        if (storageSession) {
            //storageSessionに'curationJson'がない場合 curationJsonは nullになる
            curationJson = JSON.parse(storageSession.getItem('curationJson'));
        }
        if (isValidCurationFalseTrue(curationJson)) {
            //外部キュレーションを編集中の場合、新規エクスポート、上書きエクスポート、JSONファイル保存の
            //いずれのケースでも、外部キュレーションのselections部分のみを差し替えた内容にする。
            //（外部キュレーションに設定されていた label等は引き継がれる。）
            curationJson.selections = getCurationListSelections(getFavs());
        } else {
            //外部キュレーションを編集中ではない場合、デフォルトの設定内容をもったCuration JSONを生成
            curationJson = getCurationJsonFromFavs(getFavs());
        }
        return curationJson;
    }
    function exportCurationJson(curationJson, options) {
        var jsonExport = getCurationJsonExport(); //function or url
        if (jsonExport) {
            if ($.isFunction(jsonExport)) {
                jsonExport(curationJson, options);
            } else {
                var curationString = JSON.stringify(curationJson, null, '\t');
                $('<form>').attr({ action: jsonExport, method: 'post', target: '_blank' })
                    .append($('<input>').attr({ type: 'hidden', name: 'curation', value: encodeURIComponent(curationString) }))
                    .append($('<input>').attr({ type: 'hidden', name: 'lang', value: lng }))
                    .appendTo(document.body)
                    .submit()
                    .remove();
            }
        }
    }

    //curationでCanvasに付与されている付加情報（metadata, description, durationHint）の配列を返す
    function getCanvasMetadataFromCuration(curation) {
        var metadataList = [];
        var i, j;
        if ($.isPlainObject(curation)) {
            for (i = 0; i < curation.selections.length; i++) {
                var range = curation.selections[i];
                // http://iiif.io/api/presentation/2.1/#range
                if ($.isPlainObject(range) && range['@type'] === 'sc:Range') {
                    if (range.within) { //withinプロパティ
                        var manifestUrl = '';
                        var timelineUrl = '';
                        var within = range.within;
                        if ($.type(within) === 'string') {
                            manifestUrl = within;
                        } else if ($.isPlainObject(within) && within['@id'] && within['@type'] && $.type(within['@id']) === 'string') {
                            if (within['@type'] === 'sc:Manifest') {
                                manifestUrl = within['@id'];
                            } else if (within['@type'] === 'tl:Manifest' || within['@type'] === 'codh:Manifest') {
                                timelineUrl = within['@id'];
                            }
                        }
                        if (manifestUrl) {
                            if ($.isArray(range.canvases)) { //Rangeのcanvasesプロパティによる表示対象指定
                                for (j = 0; j < range.canvases.length; j++) {
                                    metadataList.push({}); //各要素は undefined
                                }
                            } else if ($.isArray(range.members)) { //membersプロパティによる表示対象指定
                                //membersプロパティ内では、sc:Canvasのみ対応。membersプロパティ内のsc:Rangeは未対応。
                                for (j = 0; j < range.members.length; j++) {
                                    var member = range.members[j];
                                    if ($.isPlainObject(member)) {
                                        metadataList.push({
                                            metadata: member.metadata,
                                            description: member.description,
                                            durationHint: member.durationHint
                                        });
                                    }
                                }
                            }
                        } else if (timelineUrl) {
                            if ($.isArray(range.members)) { //membersプロパティによる表示対象指定のみ有効
                                //membersプロパティ内では、sc:Canvasのみ対応。membersプロパティ内のsc:Rangeは未対応。
                                for (j = 0; j < range.members.length; j++) {
                                    var member_ = range.members[j];
                                    if ($.isPlainObject(member_)) {
                                        metadataList.push({
                                            metadata: member_.metadata,
                                            description: member_.description,
                                            durationHint: member_.durationHint
                                        });
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
        return metadataList;
    }
    //外部キュレーションを表示しているとき、外部キュレーションに基づくfav配列を返す
    function getBrowsingCurationFavs() {
        var favData = [];
        if (getBrowsingCurationUrl()) {
            var metadata = getCanvasMetadataFromCuration(getBrowsingCurationJson());
            for (var i = 0; i < pageInfos.length; i++) {
                var options;
                if (metadata.length === pageInfos.length) {
                    var metadatum = metadata[i];
                    options = {
                        indexInBrowsingCuration: String(i + 1), //1-based
                        metadata: metadatum.metadata,
                        description: metadatum.description,
                        durationHint: metadatum.durationHint
                    };
                }
                favData.push(makeFav(i, options));
            }
        }
        return favData;
    }

    //Number.prototype.toLocaleString()が利用できない環境を考慮
    function formatInteger(int) {
        return String(int).replace(/(\d)(?=(\d\d\d)+(?!\d))/g, '$1,');
    }

    //----------------------------------------------------------------------
    //IIIF Presentation API関係
    function escapeRegExp(string) {
        // https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Regular_Expressions
        // https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Regular_Expressions$revision/331165
        // Created: Nov 26, 2012, 2:45:01 AM
        // Creator: rodneyrehm
        // https://developer.mozilla.org/en-US/docs/MDN/About#Copyrights_and_licenses
        // Code samples added on or after August 20, 2010 are in the public domain.
        return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); // $& means the whole matched string
    }
    function unescapeLimitedHtmlTag(htmlEscapedString) {
        // http://iiif.io/api/presentation/2.1/#html-markup-in-property-values
        // In order to avoid HTML or script injection attacks, clients must remove:
        //  - All attributes other than href on the a tag, src and alt on the img tag.
        // Clients should allow only a, b, br, i, img, p, and span tags.
        // Clients may choose to remove any and all tags
        // ここでは、aタグとbタグ、brタグ、iタグ、pタグ、spanタグのみ許可する
        function allowHtmlTag(string, tag) {
            var reg1 = new RegExp('&lt;' + tag + '(?:\\s.*?)?&gt;', 'gi');
            var reg2 = new RegExp('&lt;/' + tag + '\\s*&gt;', 'gi');
            return string.replace(reg1, '<' + tag + '>').replace(reg2, '</' + tag + '>');
        }
        function allowHtmlTagVoidElement(string, tag) {
            var reg = new RegExp('&lt;' + tag + '(?:\\s.*?)?/?&gt;', 'gi');
            return string.replace(reg, '<' + tag + '>');
        }
        var reg = new RegExp(/(&lt;a\s.+?&gt;)(.+?)(&lt;\/a\s*&gt;)/gi); //aタグ
        var result = htmlEscapedString.replace(reg,
            function(match, p1, p2, p3 /*, offset, string*/) {
                var result = match;
                if (p1 && p2 && p3) {
                    var hrefUrl = $('<span>').append(p1.replace(/^&lt;/i, '<').replace(/&gt;$/i, '>') + p2 + '</a>').children('a').attr('href');
                    if (hrefUrl) {
                        var href = getAbsoluteUrl(hrefUrl);
                        if (/^https?:\/\//.test(href)) {
                            result = $('<a>').attr('href', hrefUrl).html(p2).prop('outerHTML');
                        }
                    }
                }
                return result;
            }
        );
        result = allowHtmlTag(result, 'b');
        result = allowHtmlTag(result, 'i');
        result = allowHtmlTag(result, 'p');
        result = allowHtmlTag(result, 'span');
        result = allowHtmlTagVoidElement(result, 'br');
        return result;
    }
    function getHtmlLinkUrl(prop) {
        // format属性値が'text/html'であるものについて、@id属性値を返す
        var result = '';
        if ($.isPlainObject(prop)) {
            if (prop['@id'] && prop.format === 'text/html') {
                return prop['@id'];
            }
        } else if ($.isArray(prop)) {
            for (var i = 0; i < prop.length; i++) {
                result = getHtmlLinkUrl(prop[i]);
                if (result) {
                    return result;
                }
            }
        }
        return result;
    }
    function getKeyValuesShallow(obj, key, option) {
        // plain string または key属性値 の配列を返す（浅い探索のみ）
        var opt = option || {};
        var result;
        if ($.isArray(obj)) {
            return $.map(obj, function(element) {
                if ($.isPlainObject(element)) {
                    return element[key];
                } else if ($.type(element) === 'string') {
                    return element;
                } else if (opt.allowNumber === true && $.type(element) === 'number') {
                    return String(element);
                } else if (opt.allowBoolean === true && $.type(element) === 'boolean') {
                    return String(element);
                } else if (opt.allowNull === true && $.type(element) === 'null') {
                    return String(element);
                } else {
                    return null; //elementがArrayの場合は無視
                }
            });
        }
        if ($.isPlainObject(obj)) {
            result = obj[key] || '';
        } else {
            result = obj;
        }
        if ($.type(result) === 'string') {
            return [result];
        } else if (opt.allowNumber === true && $.type(result) === 'number') {
            return [String(result)];
        } else if (opt.allowBoolean === true && $.type(result) === 'boolean') {
            return [String(result)];
        } else if (opt.allowNull === true && $.type(result) === 'null') {
            return [String(result)];
        } else {
            return []; //入れ子を降りていって探すことはしない
        }
    }
    function getUriRepresentations(prop) {
        // plain string または @id属性値 の配列を返す（format属性による限定はしない）
        // http://iiif.io/api/presentation/2.1/#uri-representation
        // http://iiif.io/api/presentation/2.1/#repeated-properties
        return getKeyValuesShallow(prop, '@id');
    }
    function getPropertyValuesI18n(prop, lang, option) {
        // @languageを考慮した属性値の配列を返す
        // http://iiif.io/api/presentation/2.1/#language-of-property-values
        // This pattern may be used in label, description, attribution and 
        // the label and value fields of the metadata construction.
        var opt = option || {};
        function getElementsI18n(arr, lang) {
            if ($.isArray(arr)) {
                return arr.filter(function(element) {
                    return $.isPlainObject(element) && '@value' in element && (element['@language'] === lang || !lang);
                });
            } else {
                return [];
            }
        }
        var result = prop;
        var key = '@value';
        if ($.isArray(prop)) {
            result = getElementsI18n(prop, lang);
            if (result.length > 0) {
                //言語設定に一致するものがある → 一致したものを表示
            } else {
                var propNum = prop.filter(function(element) {
                    return ($.isPlainObject(element) && key in element) || $.type(element) === 'string';
                }).length;
                var langPropNum = getElementsI18n(prop).length;
                if (langPropNum === 0) {
                    //一つも'@language'が設定されていない → 全て表示
                    result = prop;
                } else if (langPropNum === propNum) {
                    //全ての要素に'@language'が設定されているが、言語設定に一致するものはない
                    //→ 表示すべき言語を決めて、それに一致したものを表示
                    result = getElementsI18n(prop, 'en'); //fallbackで英語を選択
                    if (result.length === 0) {
                        //fallbackで選択した英語がなければ、配列先頭に記述されている言語を選択
                        result = getElementsI18n(prop);
                        if (result.length > 0) {
                            result = getElementsI18n(prop, result[0]['@language']);
                        }
                    }
                } else {
                    //一部の要素に'@language'が設定されているが、言語設定に一致するものはない
                    //→ '@language'が設定されていないものを全て表示
                    result = prop.filter(function(element) {
                        if ($.isPlainObject(element)) {
                            return !element['@language'];
                        } else if ($.type(element) === 'string') {
                            return element;
                        } else {
                            return false; //elementがArrayの場合は無視
                        }
                    });
                }
            }
        }
        return getKeyValuesShallow(result, key, opt);
    }
    function getPropertyValueI18n(prop, lang, option) {
        // @languageを考慮した属性値のコンマ区切り文字列を返す
        if (!lang) {
            lang = lng;
        }
        return getPropertyValuesI18n(prop, lang, option).join(', ');
    }
    function getPropertyValueI18nAsHtml(prop, option) {
        var opt = option || {};
        var value = getPropertyValueI18n(prop, undefined, option); //raw
        value = $('<span>').text(value).html(); //escaped
        if (opt.allowMinimalHtmlTag) {
            value = unescapeLimitedHtmlTag(value); //一部のタグを許可
        }
        return value;
    }
    function getRegeionFromFragment(fragment) {
        var region = 'full';
        if (fragment) {
            //https://www.w3.org/TR/media-frags/#naming-space
            var match = fragment.match(/xywh=(?:pixel:)?([0-9]+),([0-9]+),([0-9]+),([0-9]+)/); //「percent:」は未対応
            if (match) {
                var x = parseInt(match[1], 10);
                var y = parseInt(match[2], 10);
                var w = parseInt(match[3], 10);
                var h = parseInt(match[4], 10);
                region = [x, y, w, h].join(',');
            }
        }
        return region;
    }
    function getMajorVersionNumberFromSemVer(semVer) {
        var major = parseInt((semVer.split('.'))[0], 10);
        if (isNaN(major)) {
            return -1;
        } else {
            return major;
        }
    }
    function getLabelValuePair(object) {
        var string = '';
        if (object) {
            var delimiter = (lng !== 'ja') ? ': ' : '：';
            $.each(object, function(_, val) {
                if (val && 'label' in val && 'value' in val) {
                    var facetLabel = getPropertyValueI18n(val.label, lng);
                    var facetValue = getPropertyValueI18n(val.value, lng, { allowNumber: true, allowBoolean: true });
                    string += facetLabel + delimiter + facetValue + '<br>';
                }
            });
        }
        return string;
    }
    function getLabelValuePairAsArray(object) {
        var result = [];
        if (object) {
            $.each(object, function(_, val) {
                if (val && 'label' in val && 'value' in val) {
                    var facetLabel = getPropertyValueI18n(val.label, lng);
                    var facetValue = getPropertyValueI18n(val.value, lng, { allowNumber: true, allowBoolean: true });
                    result.push({
                        label: facetLabel,
                        value: facetValue
                    });
                }
            });
        }
        return result;
    }
    function getManifestMetadataAsHtml(manifestMetadata) {
        var result;
        var metadata = getLabelValuePairAsArray(manifestMetadata);
        if (metadata.length > 0) {
            result = '';
            for (var i = 0; i < metadata.length; i++) {
                var label = $('<div>').addClass('info_metadatum_label').text(metadata[i].label).prop('outerHTML');
                //label = unescapeLimitedHtmlTag(label); //labelではHTMLマークアップは不許可
                var value = $('<div>').addClass('info_metadatum_value').text(metadata[i].value).prop('outerHTML');
                value = unescapeLimitedHtmlTag(value);
                result += '<div class="info_metadatum">' + label + value + '</div>';
            }
        }
        return result;
    }
    function getManifestShareAsHtml(manifestUrl) {
        if (manifestUrl) {
            var $result;
            if (/^https?:\/\//.test(manifestUrl)) {
                var manifestShareUrl = manifestUrl;
                manifestShareUrl += manifestUrl.indexOf('?') !== -1 ? '&' : '?';
                manifestShareUrl += 'manifest=' + encodeURIComponentForQuery(manifestUrl);
                $result = $('<a>').attr({ href: manifestShareUrl, target: '_blank' });
            } else {
                $result = $('<span>');
            }
            return $result.text(manifestUrl).prop('outerHTML');
        }
        return;
    }
    // navPlace関係
    var navPlaceMapsSelectedIndex = 0;
    var navPlaceMap = null;
    function isNumberArray(arr, requiredCount) {
        if (!$.isArray(arr)) {
            return false;
        }
        if (requiredCount !== undefined && arr.length !== requiredCount) {
            return false;
        }
        for (var i = 0; i < arr.length; i++) {
            if (typeof arr[i] === 'number' && isFinite(arr[i])) {
                //
            } else {
                return false;
            }
        }
        return true;
    }
    function getNavPlaceAsHtml(navPlace) {
        if (navPlace && $.isPlainObject(navPlace) && $.isArray(navPlace.features)) {
            var features = navPlace.features;
            var $result = $('<div>');
            var $leafletContainer = $('<div>').attr('id', 'leaflet_navPlace_container');
            var label;
            var value;
            var result;
            var i;
            var featuresCarouselId = 'navPlace_features_carousel';
            var $featuresCarousel = $('<div>').attr({
                'id': featuresCarouselId,
                'data-wrap': false,
                'data-interval': false
            }).addClass('carousel slide clickable-child');
            var $carouselInner = $('<div>').attr('role', 'listbox').addClass('carousel-inner');

            var $carouselControls = $('<div>').addClass('carousel-controls-custom');
            var $carouselControlLeft = $('<button>').attr({
                'type': 'button',
                'data-target': '#' + featuresCarouselId
            }).addClass('btn btn-sm btn-default carousel-control-custom carousel-control-left').html('<span class="glyphicon glyphicon-chevron-left"></span>');
            var $carouselControlRight = $('<button>').attr({
                'type': 'button',
                'data-target': '#' + featuresCarouselId
            }).addClass('btn btn-sm btn-default carousel-control-custom carousel-control-right').html('<span class="glyphicon glyphicon-chevron-right"></span>');
            var $slideNumber = $('<div>').addClass('carousel-slide-number');
            $carouselControls.append($carouselControlLeft).append($slideNumber).append($carouselControlRight);

            var carouselItemsCount = 0;
            for (i = 0; i < features.length; i++) {
                var feature = features[i];
                if (feature) {
                    var $carouselItem = $('<div>').attr({
                        'data-feature-index': i
                    }).addClass('item');
                    var hasCarouselItem = false;
                    if ($.isPlainObject(feature.properties)) {
                        var properties = feature.properties;
                        if (properties.label) {
                            label = $('<div>').addClass('info_navPlace_feature_label').text('Label').prop('outerHTML');
                            value = $('<div>').addClass('info_navPlace_feature_value').text(getPropertyValueI18n(properties.label)).prop('outerHTML');
                            result = '<div class="info_navPlace_feature">' + label + value + '</div>';
                            $carouselItem.append(result);
                            hasCarouselItem = true;
                        }
                    }
                    if ($.isPlainObject(feature.geometry)) {
                        var geometry = feature.geometry;
                        label = $('<div>').addClass('info_navPlace_feature_label').text('Type').prop('outerHTML');
                        value = $('<div>').addClass('info_navPlace_feature_value').text(geometry.type).prop('outerHTML');
                        result = '<div class="info_navPlace_feature">' + label + value + '</div>';
                        label = $('<div>').addClass('info_navPlace_feature_label').text('Coordinates').prop('outerHTML');
                        value = $('<div>').addClass('info_navPlace_feature_value coordinates').append(getMapSelectorLink(feature)).prop('outerHTML');
                        result += '<div class="info_navPlace_feature">' + label + value + '</div>';
                        $carouselItem.append(result);
                        hasCarouselItem = true;
                    }
                    if ($.isPlainObject(feature.properties)) {
                        var geoLODLink = getGeoLODLink(feature);
                        if (geoLODLink) {
                            label = $('<div>').addClass('info_navPlace_feature_label').text('GeoLOD').prop('outerHTML');
                            value = $('<div>').addClass('info_navPlace_feature_value').append(geoLODLink).prop('outerHTML');
                            result = '<div class="info_navPlace_feature">' + label + value + '</div>';
                            $carouselItem.append(result);
                            hasCarouselItem = true;
                        }
                    }
                    if (hasCarouselItem) {
                        if (carouselItemsCount === 0) {
                            $carouselItem.addClass('active');
                        }
                        $carouselInner.append($carouselItem);
                        carouselItemsCount++;
                    }
                }
            }
            if (carouselItemsCount) {
                if (carouselItemsCount > 1) {
                    $featuresCarousel.append($carouselControls);
                }
                $featuresCarousel.append($carouselInner);
                $result.append($featuresCarousel);
            }
            if (conf.navPlaceMaps.length) {
                if ('@language' in conf.navPlaceMaps[0] && '@value' in conf.navPlaceMaps[0]) {
                    conf.navPlaceMaps = getPropertyValuesI18n(conf.navPlaceMaps, lng); //上書きしてしまう
                }
                var mapSelect = '<select id="navPlaceMaps_select">';
                for (i = 0; i < conf.navPlaceMaps.length; i++) {
                    var navPlaceConf = conf.navPlaceMaps[i];
                    var mapName = (navPlaceConf.name) ? navPlaceConf.name : (((lng !== 'ja') ? 'Map' : 'マップ') + (i + 1));
                    if (i === navPlaceMapsSelectedIndex) {
                        mapSelect += '<option value="' + i + '" selected>' + mapName + '</option>';
                    } else {
                        mapSelect += '<option value="' + i + '">' + mapName + '</option>';
                    }
                }
                mapSelect += '</select>';
                label = $('<div>').addClass('info_navPlace_feature_label').text('Map').prop('outerHTML');
                result = '<div class="info_navPlace_feature">' + label + mapSelect + '</div>';
                $result.append(result);
            }
            $result.append($leafletContainer);
            return $result.prop('outerHTML');
        }
        return;
    }
    function updateNavPlaceFeaturesControls(carousel) {
        var $carousel = carousel && $(carousel);
        if ($carousel) {
            var totalItems = $carousel.find('.item').length;
            var $activeItem = $carousel.find('.item.active');
            var itemIndex = $activeItem.index();
            var slideNumber = itemIndex + 1;
            $carousel.find('.carousel-slide-number').text(slideNumber + '/' + totalItems);
            $carousel.find('.carousel-control-left').prop('disabled', (itemIndex === 0));
            $carousel.find('.carousel-control-right').prop('disabled', (slideNumber === totalItems));
        }
    }
    function getPointLatLng(navPlace, featureIndex) {
        featureIndex = featureIndex || 0;
        if ($.isPlainObject(navPlace) && $.isArray(navPlace.features) && navPlace.features.length > featureIndex) {
            var feature = navPlace.features[featureIndex];
            if ($.isPlainObject(feature) && $.isPlainObject(feature.geometry)) {
                var geometry = feature.geometry;
                if (geometry.type === 'Point' && isNumberArray(geometry.coordinates, 2)) { //Pointのみ対応
                    var pointCoords = geometry.coordinates;
                    var latLngPoint = L.latLng(pointCoords[1], pointCoords[0]);
                    return latLngPoint;
                }
            }
        }
        return;
    }
    function setupNavPlaceMap(navPlace, tileJSON, featureIndex) {
        try {
            if (navPlaceMap !== null) {
                navPlaceMap.remove();
            }
            navPlaceMap = L.TileJSON.createMap('leaflet_navPlace_container', tileJSON);
            L.geoJson(navPlace, {
                pointToLayer: function(feature, latlng) {
                    return L.marker(latlng);
                },
                onEachFeature: function(feature, layer) {
                    var popupContent = '';
                    if (feature.properties) {
                        var properties = feature.properties;
                        if (properties.label) {
                            var label = $('<span>').text(getPropertyValueI18n(properties.label)).prop('outerHTML');
                            popupContent += '<div>' + label + '</div>';
                        }
                    }
                    layer.bindPopup(popupContent);
                }
            }).addTo(navPlaceMap);
            var latlngInit = getPointLatLng(navPlace, featureIndex) || [0, 0];
            navPlaceMap.setView(latlngInit, 8);
        } catch(e) {
            console.log(e); // eslint-disable-line no-console
        }
    }
    function isGeometryPointInTileJsonBounds(navPlace, tileJSON, featureIndex) {
        var isPointInTileJsonBounds = true;
        //TileJSON に boundsプロパティが設定されていないときは、
        //isPointWithinTileJSONbounds: true 扱いとする
        if ($.isPlainObject(tileJSON) && isNumberArray(tileJSON.bounds, 4) &&
            $.isPlainObject(navPlace)) {
            featureIndex = featureIndex || 0;
            var latLngPoint = getPointLatLng(navPlace, featureIndex);
            if (latLngPoint) {
                var boundsArray = tileJSON.bounds;
                var tileBounds = L.latLngBounds(
                    [boundsArray[1], boundsArray[0]],
                    [boundsArray[3], boundsArray[2]]
                );
                if (!tileBounds.contains(latLngPoint)) {
                    isPointInTileJsonBounds = false;
                }
            }
        }
        return isPointInTileJsonBounds;
    }
    function showNavPlaceMap(navPlace, featureIndex) {
        if (!$.isPlainObject(navPlace)) {
            return;
        }
        var index = navPlaceMapsSelectedIndex;
        var indexTemp = 0; //すべてのbounds外のときは0番目のmapで一応表示する
        var isPointInTileBounds = true;
        var i;
        if ($.isArray(conf.navPlaceMaps)) {
            for (i = index; i < conf.navPlaceMaps.length; i++) {
                isPointInTileBounds = isGeometryPointInTileJsonBounds(navPlace, conf.navPlaceMaps[i], featureIndex);
                if (isPointInTileBounds) {
                    indexTemp = i;
                    break;
                }
            }
            if (!isPointInTileBounds) {
                for (i = 0; i < index; i++) {
                    isPointInTileBounds = isGeometryPointInTileJsonBounds(navPlace, conf.navPlaceMaps[i], featureIndex);
                    if (isPointInTileBounds) {
                        indexTemp = i;
                        break;
                    }
                }
            }
            if (indexTemp < conf.navPlaceMaps.length) {
                var tileJson = conf.navPlaceMaps[indexTemp];
                if ($.isPlainObject(tileJson)) {
                    //<select>をtempIndex番目に更新したいが、navPlaceMapsSelectedIndexは変更したくないので、
                    //changeイベントを発火させたくない → .prop()はchangeイベントを発火させない
                    $('#navPlaceMaps_select').find('option:eq(' + indexTemp + ')').prop('selected', true);
                    setupNavPlaceMap(navPlace, tileJson, featureIndex);
                }
            }
        }
    }
    function getMapSelectorLink(feature) {
        if ($.isPlainObject(feature) && $.isPlainObject(feature.geometry)) {
            var geometry = feature.geometry;
            var coodinatesText = JSON.stringify(geometry.coordinates, null, ' ');
            if (geometry.type === 'Point' && isNumberArray(geometry.coordinates, 2)) { //Pointのみ対応
                var pointCoords = geometry.coordinates;
                var latitude  = pointCoords[1];
                var longitude = pointCoords[0];
                var mapSelectorUrl = conf.service.mapSelectorUrl;
                if (mapSelectorUrl) {
                    var params_ = [];
                    params_.push('lat=' + String(latitude));
                    params_.push('lng=' + String(longitude));
                    params_.push('lang=' + lng);
                    if (params_.length > 0) {
                        mapSelectorUrl += ((mapSelectorUrl.indexOf('?') > -1) ? '&' : '?');
                        mapSelectorUrl += params_.join('&');
                    }
                    return $('<a>').attr({ href: mapSelectorUrl, target: '_blank' }).text(coodinatesText).prop('outerHTML');
                }
            }
            return coodinatesText;
        }
        return '';
    }
    function getGeoLODLink(feature) {
        if ($.isPlainObject(feature) && $.isPlainObject(feature.properties)) {
            var properties = feature.properties;
            var geoLod = properties.geolod || properties.GeoLOD || properties.geoLOD;
            if (geoLod) {
                var geoLodId;
                if ($.isPlainObject(geoLod)) {
                    geoLodId = String(geoLod['@id'] || geoLod['id']);
                } else if (typeof geoLod === 'string') {
                    geoLodId = geoLod;
                }
                var geoLodUrl = 'https://geolod.ex.nii.ac.jp/resource/';
                if (geoLodId && geoLodId.indexOf(geoLodUrl) === 0) {
                    return $('<a>').attr({ href: geoLodId, target: '_blank' }).text(geoLodId).prop('outerHTML');
                }
            }
        }
        return '';
    }

    //Cursor API関係
    function getCursorEndpointUrlFromCursor(cursor) {
        var cursorEndpointUrl = null;
        if ($.isPlainObject(cursor) && $.isPlainObject(cursor.service)) {
            var service = cursor.service;
            if (service['@context'] && service['@context'] === CONTEXT_CURSOR &&
                service['@id'] && $.type(service['@id']) === 'string') {
                cursorEndpointUrl = service['@id'];
            }
        }
        return cursorEndpointUrl;
    }
    function getCursorUrl(cursorEndpointUrl, cursorIndex) {
        var cursorUrl = null;
        if (cursorEndpointUrl && getCursorIndexFromProp(cursorIndex) !== null) {
            cursorUrl = cursorEndpointUrl;
            cursorUrl += cursorEndpointUrl.indexOf('?') !== -1 ? '&' : '?';
            cursorUrl += 'cursorIndex=' + cursorIndex;
        }
        return cursorUrl;
    }
    function getCursorIndexFromCursorUrl(cursorUrl) {
        var cursorIndex = null;
        var cursorUrl_ = cursorUrl.split('?');
        if (cursorUrl_.length > 1) {
            var match = cursorUrl_[1].match(/(?:&)?cursorIndex=(-?[0-9]+)(&|$)/);
            if (match) {
                cursorIndex = parseInt(match[1], 10);
            }
        }
        return cursorIndex;
    }
    function getCursorIndexFromCanvas(canvas) {
        var cursorIndex = null;
        if (!canvas) { return cursorIndex; }
        if ($.isPlainObject(canvas) && canvas['@id'] && canvas['@type']) {
            if ((canvas['@type'] === 'cs:Canvas' || canvas['@type'] === 'codh:Canvas') && 'cursorIndex' in canvas) {
                cursorIndex = getCursorIndexFromProp(canvas.cursorIndex);
            }
        }
        return cursorIndex;
    }
    function getCursorIndexFromProp(prop) {
        var cursorIndex = null;
        if (prop === null || prop === undefined) { return cursorIndex; }
        var match = String(prop).match(/^(-?[0-9]+)$/);
        if (match) {
            cursorIndex = parseInt(match[1], 10);
        }
        return cursorIndex;
    }

    function getManifestVersion(manifest) {
        var version = -1;
        if ($.isPlainObject(manifest)) {
            var context = manifest['@context'];
            var contexts;
            if ($.type(context) === 'string') {
                contexts = [context];
            } else if ($.isArray(context)) {
                contexts = context;
            } else {
                contexts = [];
            }
            if (contexts.indexOf('http://iiif.io/api/presentation/2/context.json') > -1) {
                //IIIF Presentation API 2.0/2.1
                version = 2;
            } else if (contexts.indexOf('http://www.shared-canvas.org/ns/context.json') > -1 ||
                contexts.indexOf('http://iiif.io/api/presentation/1/context.json') > -1) {
                //IIIF Presentation API 0.9/1.0
                version = 1;
            } else if (contexts.indexOf('http://iiif.io/api/presentation/3/context.json') > -1) {
                //IIIF Presentation API 3.0
                version = 3;
            } else if (contexts.indexOf('http://iiif.io/api/presentation/4/context.json') > -1) {
                //IIIF Presentation API 4.0
                version = 4;
            }
        }
        return version;
    }
    function getImageApiVersion(service) {
        //The service must have the @context, @id and profile keys
        //https://iiif.io/api/annex/services/#image-information

        var imageApiVersion = '0.0';
        if (service) {
            var context = service['@context'];
            if (context) {
                imageApiVersion = '1.0';
                var contextStrings = {
                    'http://iiif.io/api/image/3/context.json': '3.0',
                    'http://iiif.io/api/image/2/context.json': '2.0', //or 2.1
                    'http://library.stanford.edu/iiif/image-api/1.1/context.json': '1.1'
                };
                var contexts = [];
                if ($.isArray(context)) {
                    contexts = context;
                } else if ($.type(context) === 'string') {
                    contexts = [context];
                }
                $.each(contexts, function(_, context_) {
                    if ($.type(context_) === 'string') {
                        imageApiVersion = contextStrings[context_] || imageApiVersion;
                    }
                });
                if (service.type === 'ImageService3') {
                    imageApiVersion = '3.0';
                }
            }
        }
        return imageApiVersion;
    }
    function getImageComplianceLevel(service) {
        var imageComplianceLevel = -1;
        if (service) {
            var profile = service.profile;
            if (profile) {
                var profiles = [];
                if ($.isArray(profile)) {
                    profiles = profile;
                } else if ($.type(profile) === 'string') {
                    profiles = [profile];
                }
                $.each(profiles, function(_, profile_) {
                    if ($.type(profile_) === 'string') {
                        var match;
                        //IIIFの仕様では、Compliance Levelの記述は次のように指定することとなっている。
                        //Image API 2.x：http://iiif.io/api/image/2/level0.json
                        //Image API 1.1：http://library.stanford.edu/iiif/image-api/1.1/compliance.html#level0
                        //Image API 1.0：http://library.stanford.edu/iiif/image-api/compliance.html#level0
                        if (profile_.indexOf('http://iiif.io/api/image/2/') === 0) {
                            match = profile_.match(/level([0-2])\.json$/);
                            if (match) {
                                imageComplianceLevel = parseInt(match[1], 10);
                            }
                        } else if (profile_.indexOf('http://library.stanford.edu/iiif/image-api/') === 0) {
                            //例えば Harvard Art Museumsの manifestでは、仕様に反して
                            //http://library.stanford.edu/iiif/image-api/1.1/conformance.html#level1
                            //と記載している。こうしたサイトにも対応するため、判定基準を甘くする。
                            match = profile_.match(/#level([0-2])$/);
                            if (match) {
                                imageComplianceLevel = parseInt(match[1], 10);
                            }
                        }
                    }
                });
            }
        }
        return imageComplianceLevel;
    }
    function getImageInfoUrl(service) {
        var imageInfoUrl;
        if (service) {
            var serviceId = service['@id'];
            if (serviceId.slice(-1) === '/') {
                serviceId = serviceId.slice(0, -1);
            }
            imageInfoUrl = serviceId + '/info.json';
        }
        return imageInfoUrl;
    }
    function fixCanvasImageApiInformation(page, iiif) {
        //Manifestに記載された情報とinfo.jsonに記載された情報とが異なる場合、後者に基づいてCanvasの情報を更新する。
        //Image APIバージョンは、画像ダウンロードURL（getImageDownloadUrl）や領域選択ポップアップに表示されるURL
        //（getCroppedImageUrl）のsize部分にmaxを用いるべきかfullを用いるべきかに関わってくる。
        if (iiif && (iiif.hasImageAPIservice || iiif.hasImageAPIservice === undefined) && iiif._info) {
            var canvas = getCanvas(page);
            var imageApiVersionI = getImageApiVersion(iiif._info);
            var imageApiVersionM = getCanvasImageApiVersion(page);
            if (imageApiVersionI !== imageApiVersionM) {
                var semVer = getMajorVersionNumberFromSemVer(imageApiVersionI);
                if (semVer > 1) {
                    // console.log('fix Image API version ' + imageApiVersionM + ' to ' + imageApiVersionI);
                    canvas.imageApiVersion = imageApiVersionI;
                }
            }
        }
    }

    //オブジェクトの最低限の妥当性チェック
    //（この結果がfalseであるものは必ずinvalidだが、この結果がtrueであってもvalidとは限らない）
    function isValidCurationFalseTrue(curation) {
        //最低限のチェック（この結果のみをもってvalidと判断してはならない）
        //selections内の必須プロパティ未チェックなので、この結果のみをもってvalidと判断してはならない
        return ($.isPlainObject(curation) && $.isArray(curation['@context']) &&
            curation['@context'][0] === 'http://iiif.io/api/presentation/2/context.json' &&
            curation['@context'][1] === CONTEXT_CURATION &&
            (curation['@type'] === 'cr:Curation' || curation['@type'] === 'codh:Curation') &&
            $.isArray(curation.selections));
    }
    function isValidManifestFalseTrue(manifest) {
        //最低限のチェック（この結果のみをもってvalidと判断してはならない）
        return (checkManifestData(manifest) === ICV_ERROR.NO_ERROR);
    }
    function checkManifestData(manifest) {
        //最低限のチェック（この結果のみをもってvalidと判断してはならない）
        if ($.isPlainObject(manifest)) {
            var context = manifest['@context'];
            var contexts;
            if ($.type(context) === 'string') {
                contexts = [context];
            } else if ($.isArray(context)) {
                contexts = context;
            } else {
                contexts = [];
            }
            if (contexts.indexOf('http://iiif.io/api/presentation/2/context.json') > -1) {
                //IIIF Presentation API 2.0/2.1
                if (manifest['@type'] === 'sc:Manifest' && 'label' in manifest) {
                    //仕様上は@idも必須プロパティだが、ここではなくても可とする
                    return ICV_ERROR.NO_ERROR;
                }
            } else if (contexts.indexOf('http://www.shared-canvas.org/ns/context.json') > -1 ||
                contexts.indexOf('http://iiif.io/api/presentation/1/context.json') > -1) {
                //IIIF Presentation API 0.9/1.0
                return ICV_ERROR.UNSUPPORTED_VERSION;
            } else if (contexts.indexOf('http://iiif.io/api/presentation/3/context.json') > -1 ||
                contexts.indexOf('http://iiif.io/api/presentation/4/context.json') > -1) {
                //IIIF Presentation API 3.0/4.0
                return ICV_ERROR.UNSUPPORTED_VERSION;
            }
        }
        return ICV_ERROR.INCORRECT_DATA;
    }
    function isValidTimelineFalseTrue(timeline) {
        //最低限のチェック（この結果のみをもってvalidと判断してはならない）
        return ($.isPlainObject(timeline) && $.isArray(timeline['@context']) &&
            timeline['@context'][0] === 'http://iiif.io/api/presentation/2/context.json' &&
            timeline['@context'][1] === CONTEXT_TIMELINE &&
            (timeline['@type'] === 'tl:Manifest' || timeline['@type'] === 'codh:Manifest') &&
            'label' in timeline &&
            timeline.viewingHint === 'time' &&
            $.isArray(timeline.cursors));
    }
    function isValidCursorFalseTrue(cursor) {
        //最低限のチェック（この結果のみをもってvalidと判断してはならない）
        return ($.isPlainObject(cursor) && $.isArray(cursor['@context']) &&
            cursor['@context'][0] === 'http://iiif.io/api/presentation/2/context.json' &&
            cursor['@context'][1] === CONTEXT_CURSOR &&
            (cursor['@type'] === 'cs:Cursor' || cursor['@type'] === 'codh:Cursor') &&
            getCursorEndpointUrlFromCursor(cursor) && //cursor.serviceのチェック
            $.isPlainObject(cursor.sequence) && $.isArray(cursor.sequence.canvases));
    }
    //URLの妥当性チェック
    function isTrustedManifestUrl(manifestUrl) {
        var identifier = getIdentifierFromManifestUrl(manifestUrl);
        if (identifier) {
            return true;
        } else {
            return isTrustedUrl(manifestUrl);
        }
    }
    function isTrustedTimelineUrl(timelineUrl) {
        return isTrustedUrl(timelineUrl);
    }
    function isTrustedUrl(url) {
        var href = getAbsoluteUrl(url);
        for (var i = 0; i < conf.trustedUrlPrefixes.length; i++) {
            var trustedUrlPrefix = conf.trustedUrlPrefixes[i];
            if (trustedUrlPrefix) {
                if (href.indexOf(trustedUrlPrefix) === 0) {
                    return true;
                }
            }
        }
        return false;
    }
    //identifierとmanifestUrlの相互変換
    function isValidIdentifier(identifier) {
        if (identifier && $.type(identifier) === 'string') {
            var confIdentifier = conf.resolveIdentifierSetting.identifierPattern;
            if (confIdentifier) {
                var reg = new RegExp('^' + confIdentifier + '$');
                return identifier.search(reg) === 0;
            }
        }
        return false;
    }
    function getIdentifierFromManifestUrl(manifestUrl) {
        var identifier = '';
        if (manifestUrl && $.type(manifestUrl) === 'string') {
            var confManifestUrlPrefix = conf.resolveIdentifierSetting.manifestUrlPrefix;
            var confIdentifierPattern = conf.resolveIdentifierSetting.identifierPattern;
            var confManifestUrlSuffix = conf.resolveIdentifierSetting.manifestUrlSuffix;
            //resolveIdentifierSettingの設定がない場合は、manifestUrlからidentifierへの変換はできない
            if (confManifestUrlPrefix && confIdentifierPattern) {
                var identifierReg = '(' + confIdentifierPattern + ')';
                var reg = new RegExp('^' + escapeRegExp(confManifestUrlPrefix) + identifierReg + escapeRegExp(confManifestUrlSuffix) + '$');
                var match = manifestUrl.match(reg);
                if (match) {
                    if (isValidIdentifier(match[1])) {
                        identifier = match[1];
                    }
                }
            }
        }
        return identifier;
    }
    function getManifestUrlFromIdentifier(identifier) {
        var manifestUrl = '';
        var confManifestUrlPrefix = conf.resolveIdentifierSetting.manifestUrlPrefix;
        var confIdentifierPattern = conf.resolveIdentifierSetting.identifierPattern;
        var confManifestUrlSuffix = conf.resolveIdentifierSetting.manifestUrlSuffix;
        //resolveIdentifierSettingの設定がない場合は、identifierからmanifestUrlへの変換はできない
        if (confManifestUrlPrefix && confIdentifierPattern) {
            if (isValidIdentifier(identifier)) {
                //以下のようなパターンでmanifestを返すサイトもある。
                //https://manifests.britishart.yale.edu/manifest/{OBJECT_ID}
                //https://iiif.harvardartmuseums.org/manifests/object/{OBJECT_ID}
                //http://iiif.bodleian.ox.ac.uk/iiif/manifest/{OBJECT_ID}.json
                manifestUrl = confManifestUrlPrefix + identifier + confManifestUrlSuffix;
            }
        }
        return manifestUrl;
    }

    function getRegeion(page) {
        return getRegeionFromFragment(pageInfos[page].fragment);
    }
    function getFullSizeKeyword(page) {
        //fullが廃止されてmaxになったのはsize、Regionはv3.0でもfullを用いる
        var semVer = getCanvasImageApiVersion(page);
        var major = getMajorVersionNumberFromSemVer(semVer);
        if (major > 2) {
            return 'max';
        } else {
            return 'full';
        }
    }
    function getQuality(page) {
        var semVer = getCanvasImageApiVersion(page);
        var major = getMajorVersionNumberFromSemVer(semVer);
        if (major < 2) {
            return 'native';
        } else {
            return 'default';
        }
    }
    function getThumbnailUrl(page, region, width, height) {
        var complianceLevel = getCanvasImageComplianceLevel(page);
        if (complianceLevel === 0) {
            //Compliance Level 0 の場合は、Sizeにfull以外を指定しての取得は未対応と考える。
            //また、Regionにfull以外（x,y,w,hなど）を指定しての取得は期待できない上に、
            //Getty Museum のように、/full/full/ では画像を返してくれないサイトもあるので、
            //明示的にサムネイルの設定があれば、そちらを利用する。
            //https://iiif.io/api/image/2.1/compliance/#size
            var thumbnailUrl = getCanvasThumbnailUrl(page);
            if (thumbnailUrl) {
                return thumbnailUrl;
            }
        }
        var canvasImageInfoUrl = getCanvasImageInfoUrl(page);
        if (canvasImageInfoUrl) {
            var region_ = region || getRegeion(page);
            var w = width || 200;
            var h = height || 200;
            var size;
            if (complianceLevel >= 2) {
                size = '!' + w + ',' + h; //'!200,200';
            } else if (complianceLevel === 1) {
                size = w + ','; //'200,';
            } else if (complianceLevel === 0) {
                size = getFullSizeKeyword(page);
            } else {
                size = '!' + w + ',' + h; //complianceLevel不明
            }
            var rotation = 0;
            var quality = getQuality(page);
            var format = 'jpg';
            var imageReqParams = [region_, size, rotation, quality + '.' + format].join('/');
            return canvasImageInfoUrl.replace('/info.json', '/' + imageReqParams);
        } else {
            //IIIF Image API非対応リソース
            return getCanvasImageResourceId(page);
        }
    }
    function getPsuedoIIIFThumbnail($image, page, region, width, height) {
        //サムネイル一覧向けサムネイルを取得（IIIF Image API非対応リソース用）
        var regionElems = (region || getRegeion(page)).split(',');
        if (regionElems.length === 4) {
            var x = parseInt(regionElems[0], 10);
            var y = parseInt(regionElems[1], 10);
            var w = parseInt(regionElems[2], 10);
            var h = parseInt(regionElems[3], 10);
            var targetW = width || 200;
            var targetH = height || 200;
            if (w < 1) { w = 1; }
            if (h < 1) { h = 1; }
            var ratioW = targetW / w;
            var ratioH = targetH / h;
            var ratio = Math.min(ratioW, ratioH, 1);
            var $psuedoIiifThumbnail = $('<div>').addClass('psuedo_iiif_thumbnail').css({ width: (w * ratio) + 'px', height: (h * ratio) + 'px' });
            $image.addClass('psuedo_iiif').css({ 'transform': 'scale(' + ratio + ') translate(' + (-x) + 'px,' + (-y) + 'px)' });
            return $psuedoIiifThumbnail.append($image);
        } else {
            return $image;
        }
    }
    function getPsuedoIIIFThumbnailInCurationList($image, fragment, width, height) {
        //キュレーションリスト画面向けサムネイルを取得（IIIF Image API非対応リソース用）
        var regionElems = getRegeionFromFragment(fragment).split(',');
        if (regionElems.length === 4) {
            var x = parseInt(regionElems[0], 10);
            var y = parseInt(regionElems[1], 10);
            var w = parseInt(regionElems[2], 10);
            var h = parseInt(regionElems[3], 10);
            var targetW = width || 100;
            var targetH = height || 90;
            if (w < 1) { w = 1; }
            if (h < 1) { h = 1; }
            var ratioW = targetW / w;
            var ratioH = targetH / h;
            var ratio = Math.min(ratioW, ratioH, 1);
            var $psuedoIiifThumbnail = $('<div>').addClass('psuedo_iiif_thumbnail').css({ width: (w * ratio) + 'px', height: (h * ratio) + 'px', margin: 'auto' });
            $image.addClass('psuedo_iiif').css({ 'transform': 'scale(' + ratio + ') translate(' + (-x) + 'px,' + (-y) + 'px)' });
            return $psuedoIiifThumbnail.append($image);
        } else {
            return null;
        }
    }
    function getImageDownloadUrl(page) {
        var complianceLevel = getCanvasImageComplianceLevel(page);
        if (complianceLevel === 0 || complianceLevel === -1) {
            //Compliance Level 0 の場合は、Regionにfull以外を指定しての取得は未対応と考える
            //IIIF Image API非対応リソースの場合も画像全体を返す
            return getCanvasImageResourceId(page);
        } else {
            var canvasImageInfoUrl = getCanvasImageInfoUrl(page);
            var region = getRegeion(page);
            var size = getFullSizeKeyword(page);
            var rotation = 0;
            var quality = getQuality(page);
            var format = 'jpg';
            var imageReqParams = [region, size, rotation, quality + '.' + format].join('/');
            return canvasImageInfoUrl.replace('/info.json', '/' + imageReqParams);
        }
    }

    //bookInfos[].canvases[]要素へのアクセスヘルパー
    function getCanvas(page) {
        var bookIndex = pageInfos[page].bookIndex;
        var pageLocal = pageInfos[page].pageLocal;
        return bookInfos[bookIndex].canvases[pageLocal - 1];
    }
    function getCanvasImageInfoUrl(page) {
        return getCanvas(page).imageInfoUrl; //info.jsonのURL
    }
    function getCanvasId(page) {
        return getCanvas(page).id;
    }
    function getCanvasIds(bookIndex) {
        var canvasIds = [];
        for (var i = 0; i < bookInfos[bookIndex].totalPagesNum; i++) {
            canvasIds.push(bookInfos[bookIndex].canvases[i].id);
        }
        return canvasIds;
    }
    function getCanvasCursorIndex(page) {
        return getCanvas(page).cursorIndex;
    }
    function getCanvasLabel(page) {
        return getCanvas(page).label;
    }
    function getCanvasMetadata(page) {
        return getCanvas(page).metadata; //manifestでCanvasに付与されたmetadata
    }
    function getCanvasDescription(page) {
        return getCanvas(page).description;
    }
    function getCanvasImageApiVersion(page) {
        return getCanvas(page).imageApiVersion;
    }
    function getCanvasImageComplianceLevel(page) {
        return getCanvas(page).imageComplianceLevel; //IIIF Image API非対応リソースの場合は-1
    }
    function getCanvasImageResourceId(page) {
        return getCanvas(page).imageResourceId;
    }
    function getCanvasThumbnailUrl(page) {
        return getCanvas(page).thumbnail; //undefinedもありうる
    }
    function getCanvasWidth(page) {
        return getCanvas(page).width;
    }
    function getCanvasHeight(page) {
        return getCanvas(page).height;
    }
    function getCanvasAnnotations(page) {
        return getCanvas(page).annotations;
    }
    //bookInfos[].manifest要素へのアクセスヘルパー
    function getManifest(page) {
        var bookIndex = pageInfos[page].bookIndex;
        return bookInfos[bookIndex].manifest;
    }
    function getManifestUrl(page) {
        var bookIndex = pageInfos[page].bookIndex;
        return bookInfos[bookIndex].manifestUrl;
    }
    function getManifestViewingDirection(page) {
        return getManifest(page).viewingDirection || (isTimelineMode ? 'left-to-right' : 'right-to-left'); //ビューワのデフォルトは右開きとする
    }

    //getter/setter
    function getMap() {
        return map;
    }
    function getLang() {
        return lng;
    }
    function getCurrentPage() {
        return page; //0-based
    }
    function getTotalPages() {
        return pageInfos.length;
    }
    function getBrowsingCurationJson() {
        return curationInfo.curation || {};
    }
    function getBrowsingCurationUrl() {
        return curationInfo.curationUrl || '';
    }
    function getCurationJsonExportUrl() {
        return conf.service.curationJsonExportUrl || '';
    }
    function getCurationJsonExport() {
        return conf.service.curationJsonExport;
    }
    function setCurationJsonExport(arg) { //arg: callback function or url or null
        if ($.isFunction(arg)) {
            conf.service.curationJsonExport = arg;
        } else if ($.type(arg) === 'string') {
            conf.service.curationJsonExport = arg;
            conf.service.curationJsonExportUrl = arg;
        } else {
            conf.service.curationJsonExport = '';
        }
    }
    function getCroppedImageExportUrl() {
        return conf.service.croppedImageExportUrl || '';
    }
    function getCroppedImageExport() {
        return conf.service.croppedImageExport;
    }
    function setCroppedImageExport(arg) { //arg: callback function or url or null
        if ($.isFunction(arg)) {
            conf.service.croppedImageExport = arg;
        } else if ($.type(arg) === 'string') {
            conf.service.croppedImageExport = arg;
            conf.service.croppedImageExportUrl = arg;
        } else {
            conf.service.croppedImageExport = '';
        }
    }
    function setEventHandler(events, handler) {
        if ($.type(events) === 'string' && $.isFunction(handler)) {
            if (conf.eventHandler === void 0) {
                conf.eventHandler = {};
            }
            if ($.isArray(conf.eventHandler[events])) {
                conf.eventHandler[events].push(handler);
            } else {
                conf.eventHandler[events] = [handler];
            }
        }
    }
    function handleEvent(events, e) {
        if (conf.eventHandler && $.isArray(conf.eventHandler[events])) {
            $.each(conf.eventHandler[events], function() {
                if ($.isFunction(this)) {
                    this(e);
                }
            });
        }
    }
    function getName() {
        return APP_NAME;
    }
    function getMode() {
        var mode;
        if (params) {
            mode = params.mode;
        }
        return mode;
    }
    function setMode(mode) {
        if (params) {
            params.mode = mode;
        }
    }
    return {
        //v1.0
        prev: onPrevPage,
        next: onNextPage,
        prevBook: onPrevBook,
        nextBook: onNextBook,
        gotoPage: gotoPage,
        showThumbnails: showThumbnails,
        showInfo: showInfo,
        showHelp: showHelp,
        //v1.1
        showCurationList: showCurationList,
        toggleFav: toggleFav,
        //v1.2
        latest: gotoLatest,
        decreaseStep: decreaseStep,
        increaseStep: increaseStep,
        //v1.4
        getMap: getMap, //L.map
        getLang: getLang, //'en' or 'ja'
        getCurrentPage: getCurrentPage, //0-based
        getTotalPages: getTotalPages,
        //curation関係
        /*  あるタブで外部キュレーションを読み込んで表示している場合、
              getBrowsingCurationUrl() === getEditingCurationUrl()
            となり、そのまま同じタブで他のmanifestを読み込んだ場合、
            getEditingCurationUrl() は変化せず、getBrowsingCurationUrl() は '' となる。

            あるタブで外部キュレーションを読み込んで表示している場合、
            getBrowsingCurationJson() で返るjsonは、外部キュレーションの元のままの内容であり、
            getEditingCurationJson() で返るjsonは、キュレーションリスト画面でのリスト編集が反映された内容となる。
            そのまま同じタブで他のmanifestを読み込んだ場合、
            getEditingCurationJson() は変化せず、getBrowsingCurationJson() は {} となる。
        */
        getBrowsingCurationUrl: getBrowsingCurationUrl,   //現在表示している外部curationのURLを取得
        getBrowsingCurationJson: getBrowsingCurationJson, //現在表示している外部curationの内容を取得（編集による影響を受けない）
        getEditingCurationUrl: getEditingCurationUrl, //現在編集している外部curationのURLを取得（sessionStorage利用）
        getEditingCurationJson: getCurationListJson,  //現在編集している外部または内部curationの内容を取得
        //curation構築関係
        /*  getBrowsingCurationFavs()でfav配列を取得 → 外部でfav配列を編集（metadata編集など）
            → getCurationJsonFromFavs()の引数に編集後のfav配列を指定し、curationのjsonを作成
        */
        getBrowsingCurationFavs: getBrowsingCurationFavs, //現在表示している外部curationに基づくfav配列を取得（リスト編集による影響を受けない）
        getCurationJsonFromFavs: getCurationJsonFromFavs, //引数で指定されたfav配列からcurationのjsonを作成して取得
        //curationエクスポート関係
        /*  getCurationJsonExportUrl() は、常にエクスポート先URLの設定値を返す。
            現在の状態（ログイン状態等）に応じて、一時的にエクスポートを無効にしているとき、getCurationJsonExport() は '' を返す。
            現在の状態（ログイン状態等）に応じて、一時的にエクスポートを無効にするときは、setCurationJsonExport(null) を用いる。
            再びエクスポートを有効にするときは、setCurationJsonExport() で引数にcallbackまたはurlを指定する。
            エクスポートが有効になっているときは、getCurationJsonExport() はcallbackまたはurlを返す。
        */
        getCurationJsonExportUrl: getCurationJsonExportUrl, //curationのエクスポート先URLを取得
        getCurationJsonExport: getCurationJsonExport, //curationのエクスポートコールバック関数またはエクスポート先URLを取得
        setCurationJsonExport: setCurationJsonExport, //curationのエクスポートコールバック関数またはエクスポート先URLを設定
        exportCurationJson: exportCurationJson, //引数で指定されたjsonをエクスポートする
        //modal処理関係
        resetSubWindows: resetSubWindows, //modal表示の排他制御
        registerSubWindow: registerSubWindow, //引数には、非表示にするためのコールバック関数を指定する。返り値は unregisterSubWindow()で利用する。
        unregisterSubWindow: unregisterSubWindow, //registerSubWindow()の返り値を引数に指定し、登録解除する
        //イベント関係
        /*  IIIF Curation Viewerから送出されるイベントとしては、
                'icv.refreshPage'：refreshPage()参照
        */
        setEventHandler: setEventHandler, //イベントハンドラをセットする
        //プラグインホスト情報関係
        getName: getName, //プラグインホスト名を返す
        //v1.6
        getPropertyValueI18n: getPropertyValueI18n,
        getCroppedImageExportUrl: getCroppedImageExportUrl, //選択領域画像のエクスポート先URLを取得
        getCroppedImageExport: getCroppedImageExport, //選択領域画像のエクスポートコールバック関数またはエクスポート先URLを取得
        setCroppedImageExport: setCroppedImageExport, //選択領域画像のエクスポートコールバック関数またはエクスポート先URLを設定
        //v1.7
        getMode: getMode //ビューモードを取得（キュレーションビューモードではvoid 0、アノテーションビューモードでは'annotation'）
    };
};