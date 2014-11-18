(function (win) {
    // =========================== Init Objects ============================
    var doc = document;
    var root = doc.documentElement;
    var xhr = getXHRObject();
    var ieVersion = false;///MSIE ([\d])/.exec(navigator.userAgent)[1];

    // ========================= Common Objects ============================

    // compatiable selector engines in order of CSS3 support
    var selectorEngines = {
        "NW": "*.Dom.select",
        "DOMAssistant": "*.$",
        "Prototype": "$$",
        "YAHOO": "*.util.Selector.query",
        "MooTools": "$$",
        "Sizzle": "*",
        "jQuery": "*",
        "dojo": "*.query"
    };

    var selectorMethod;
    var enabledWatchers = [];     // array of :enabled/:dsiabled elements to poll
    var ie6PatchID = 0;      // used to solve ie6's multiple class bug
    var patchIE6MultipleClasses = true;   // if true adds class bloat to ie6
    var namespace = "slvzr"
    var domReadyScriptID = namespace + "DOMReady";

    // Stylesheet parsing regexp's
    var RE_COMMENT = /(\/\*[^*]*\*+([^\/][^*]*\*+)*\/)\s*/g;
    var RE_IMPORT = /@import\s*url\(\s*(["'])?(.*?)\1\s*\)[\w\W]*?;/g;
    var RE_PSEUDO_STRUCTURAL = /^:(empty|(first|last|only|nth(-last)?)-(child|of-type))$/;
    var RE_PSEUDO_EVENTS = /^:click$/;
    var RE_PSEUDO_ELEMENTS = /:(:first-(?:line|letter))/g;
    var RE_SELECTOR_GROUP = /(^|})\s*([^\{]*?[\[:][^{]+)/g;
    var RE_SELECTOR_PARSE = /([ +~>])|(:[a-z-]+(?:\(.*?\)+)?)|(\[.*?\])/g;
    var RE_LIBRARY_INCOMPATIBLE_PSEUDOS = /(:not\()?:(hover|enabled|disabled|focus|checked|target|active|visited|first-line|first-letter|click)\)?/g;
    var RE_PATCH_CLASS_NAME_REPLACE = /[^\w-]/g;

    // HTML UI element regexp's
    var RE_INPUT_ELEMENTS = /^(INPUT|SELECT|TEXTAREA|BUTTON)$/;
    var RE_INPUT_CHECKABLE_TYPES = /^(checkbox|radio)$/;

    // Broken attribute selector implementations
    // fixes IE7 native implementation of [^=""], [$=""] and [*=""]
    // fixes IE8 native implementation of [^=""] and [$=""]
    var BROKEN_ATTR_IMPLEMENTATIONS = ieVersion == 8 ? /[\$\^]=(['"])\1/ : ieVersion == 7 ? /[\$\^*]=(['"])\1/ : null;

    // Whitespace normalization regexp's
    var RE_TIDY_TRAILING_WHITESPACE = /([(\[+~])\s+/g;
    var RE_TIDY_LEADING_WHITESPACE = /\s+([)\]+~])/g;
    var RE_TIDY_CONSECUTIVE_WHITESPACE = /\s+/g;
    var RE_TIDY_TRIM_WHITESPACE = /^\s*((?:[\S\s]*\S)?)\s*$/;

    // String constants
    var EMPTY_STRING = "";
    var SPACE_STRING = " ";
    var PLACEHOLDER_STRING = "$1";

    // --[ getXHRObject() ]-------------------------------------------------
    function getXHRObject() {
        if (win.XMLHttpRequest) {
            return new XMLHttpRequest;
        }
        try {
            return new ActiveXObject('Microsoft.XMLHTTP');
        } catch (e) {
            return null;
        }
    }

    function determineSelectorMethod() {
        var method
        for (var engine in selectorEngines) {
            if (win[engine] && (method = eval(selectorEngines[engine].replace("*", engine)))) {
                return method
            }
        }
        return false
    }

    // --[ init() ]---------------------------------------------------------
    function init() {
        // honour the <base> tag
        var url, stylesheet;
        var baseTags = doc.getElementsByTagName("BASE");
        var baseUrl = (baseTags.length > 0) ? baseTags[0].href : doc.location.href;
        for (var c = 0; c < doc.styleSheets.length; c++) {
            stylesheet = doc.styleSheets[c];
            if (stylesheet.href != EMPTY_STRING) {
                url = resolveUrl(stylesheet.href, baseUrl);
                if (url) {
                    try {
                        length = stylesheet.length;
                        cssText = parseStyleSheet(url);
                        cssText = patchStyleSheet(cssText);
                        cssText = cssText.replace(/\n/g, '');
                        rules = cssText.match(/.*?\{.*?\}/mg);
                        if (rules) {
                            jQuery.each(rules, function (key, value) {
                                stylesheet.insertRule(value, length++);
                            });
                        }
                    } catch (e) {
                        //出错
                    }
                }
            }
        }
    }

    // --[ resolveUrl() ]---------------------------------------------------
    // Converts a URL fragment to a fully qualified URL using the specified
    // context URL. Returns null if same-origin policy is broken
    function resolveUrl(url, contextUrl) {

        function getProtocolAndHost(url) {
            return url.substring(0, url.indexOf("/", 8))
        }

        // absolute path
        if (/^https?:\/\//i.test(url)) {
            return getProtocolAndHost(contextUrl) == getProtocolAndHost(url) ? url : null
        }

        // root-relative path
        if (url.charAt(0) == "/") {
            return getProtocolAndHost(contextUrl) + url
        }

        // relative path
        var contextUrlPath = contextUrl.split("?")[0]; // ignore query string in the contextUrl	
        if (url.charAt(0) != "?" && contextUrlPath.charAt(contextUrlPath.length - 1) != "/") {
            contextUrlPath = contextUrlPath.substring(0, contextUrlPath.lastIndexOf("/") + 1);
        }

        return contextUrlPath + url;
    }

    // --[ patchStyleSheet() ]----------------------------------------------
    // Scans the passed cssText for selectors that require emulation and
    // creates one or more patches for each matched selector.
    function patchStyleSheet(cssText) {
        return cssText.replace(RE_PSEUDO_ELEMENTS, PLACEHOLDER_STRING)
                .replace(RE_SELECTOR_GROUP, function (m, prefix, selectorText) {
                    var selectorGroups = selectorText.split(",");
                    for (var c = 0, cs = selectorGroups.length; c < cs; c++) {
                        var selector = normalizeSelectorWhitespace(selectorGroups[c]) + SPACE_STRING;
                        var patches = [];
                        selectorGroups[c] = selector.replace(RE_SELECTOR_PARSE,
                                function (match, combinator, pseudo, attribute, index) {
                                    if (combinator) {
                                        if (patches.length > 0) {
                                            applyPatches(selector.substring(0, index), patches);
                                            patches = [];
                                        }
                                        return combinator;
                                    }
                                    else {
                                        var patch = (pseudo) ? patchPseudoClass(pseudo) : patchAttribute(attribute);
                                        if (patch) {
                                            patches.push(patch);
                                            alert(patches);
                                            return "." + patch.className;
                                        }
                                        return match;
                                    }
                                }
                        );
                    }
                    return prefix + selectorGroups.join(",");
                });
    }

    // --[ parseStyleSheet() ]----------------------------------------------
    // Downloads the stylesheet specified by the URL, removes it's comments
    // and recursivly replaces @import rules with their contents, ultimately
    // returning the full cssText.
    function parseStyleSheet(url) {
        if (url) {
            var cssText = loadStyleSheet(url)
            return cssText.replace(RE_COMMENT, EMPTY_STRING).replace(RE_IMPORT, function (match, quoteChar, importUrl) {
                return parseStyleSheet(resolveUrl(importUrl, url));
            });
        }
        return EMPTY_STRING;
    }

    // --[ loadStyleSheet() ]-----------------------------------------------
    function loadStyleSheet(url) {
        xhr.open("GET", url, false);
        xhr.send();
        return (xhr.status == 200) ? xhr.responseText : EMPTY_STRING;
    }

    // --[ normalizeSelectorWhitespace() ]----------------------------------
    // tidys whitespace around selector brackets and combinators
    function normalizeSelectorWhitespace(selectorText) {
        return normalizeWhitespace(selectorText
                .replace(RE_TIDY_TRAILING_WHITESPACE, PLACEHOLDER_STRING)
                .replace(RE_TIDY_LEADING_WHITESPACE, PLACEHOLDER_STRING)
                );
    }

    // --[ normalizeWhitespace() ]------------------------------------------
    // removes leading, trailing and consecutive whitespace from a string
    function normalizeWhitespace(text) {
        return trim(text).replace(RE_TIDY_CONSECUTIVE_WHITESPACE, SPACE_STRING)
    }

    // --[ trim() ]---------------------------------------------------------
    // removes leading, trailing whitespace from a string
    function trim(text) {
        return text.replace(RE_TIDY_TRIM_WHITESPACE, PLACEHOLDER_STRING)
    }

    // --[ patchPseudoClass() ]---------------------------------------------
    // returns a patch for a pseudo-class
    function patchPseudoClass(pseudo) {

        var applyClass = true;
        var className = createClassName(pseudo.slice(1));
        var isNegated = pseudo.substring(0, 5) == ":not(";
        var activateEventName;
        var deactivateEventName;

        // if negated, remove :not() 
        if (isNegated) {
            pseudo = pseudo.slice(5, -1);
        }

        // bracket contents are irrelevant - remove them
        var bracketIndex = pseudo.indexOf("(");
        if (bracketIndex > -1) {
            pseudo = pseudo.substring(0, bracketIndex);
        }

        // check we're still dealing with a pseudo-class
        if (pseudo.charAt(0) == ":") {
            switch (pseudo.slice(1)) {
                case "click":
                    activateEventName = "click";
                    applyClass = function (elm) {
                        jQuery(elm).on('click', function () {
                            var $elm = jQuery(this);
                            //移除多出来的样式
                            //jQuery("." + className).each(function() {
                            //    if (!$elm.find(this).length) {
                            //        jQuery(this).removeClass(className);
                            //    }
                            //});

                            jQuery(this).addClass(className);
                        });
                        return isNegated;
                    };
                    break;
                default:
                    // If we don't support this pseudo-class don't create 
                    // a patch for it
                    if (!RE_PSEUDO_STRUCTURAL.test(pseudo)) {
                        return false;
                    }
                    break;
            }
        }
        return {className: className, applyClass: applyClass};
    }

    // =========================== Utilitiy ================================

    function createClassName(className) {
        return namespace + "-" + ((ieVersion == 6 && patchIE6MultipleClasses) ?
                ie6PatchID++
                :
                className.replace(RE_PATCH_CLASS_NAME_REPLACE, function (a) {
                    return a.charCodeAt(0);
                }));
    }

    // --[ applyPatches() ]-------------------------------------------------
    // uses the passed selector text to find DOM nodes and patch them	
    function applyPatches(selectorText, patches) {
        alert(selectorText);
        var elms;
        // Although some selector libraries can find :checked :enabled etc. 
        // we need to find all elements that could have that state because 
        // it can be changed by the user.
        var domSelectorText = selectorText.replace(RE_LIBRARY_INCOMPATIBLE_PSEUDOS, EMPTY_STRING)

        // If the dom selector equates to an empty string or ends with 
        // whitespace then we need to append a universal selector (*) to it.
        if (domSelectorText == EMPTY_STRING || domSelectorText.charAt(domSelectorText.length - 1) == SPACE_STRING) {
            domSelectorText += "*";
        }
        // Ensure we catch errors from the selector library
        try {
            elms = selectorMethod(domSelectorText);
        } catch (ex) {
            alert("111");
            //log("Selector '" + selectorText + "' threw exception '" + ex + "'");
        }
        if (elms) {
            for (var d = 0, dl = elms.length; d < dl; d++) {
                var elm = elms[d];
                var cssClasses = elm.className;
                for (var f = 0, fl = patches.length; f < fl; f++) {
                    var patch = patches[f];
                    if (!hasPatch(elm, patch)) {
                        if (patch.applyClass && (patch.applyClass === true || patch.applyClass(elm) === true)) {
                            cssClasses = toggleClass(cssClasses, patch.className, true)
                        }
                    }
                }
                elm.className = cssClasses;
            }
        }
    }

    // --[ toggleElementClass() ]-------------------------------------------
    // toggles a single className on an element
    function toggleElementClass(elm, className, on) {
        var oldClassName = elm.className;
        var newClassName = toggleClass(oldClassName, className, on);
        if (newClassName != oldClassName) {
            elm.className = newClassName;
            elm.parentNode.className += EMPTY_STRING;
        }
    }

    // --[ toggleClass() ]--------------------------------------------------
    // adds / removes a className from a string of classNames. Used to 
    // manage multiple class changes without forcing a DOM redraw
    function toggleClass(classList, className, on) {
        var re = RegExp("(^|\\s)" + className + "(\\s|$)");
        var classExists = re.test(classList);
        if (on) {
            return classExists ? classList : classList + SPACE_STRING + className;
        } else {
            return classExists ? trim(classList.replace(re, PLACEHOLDER_STRING)) : classList
        }
    }

    // --[ hasPatch() ]-----------------------------------------------------
    // checks for the exsistence of a patch on an element
    function hasPatch(elm, patch) {
        return new RegExp("(^|\\s)" + patch.className + "(\\s|$)").test(elm.className)
    }

    // --[ patchAttribute() ]-----------------------------------------------
    // returns a patch for an attribute selector.
    function patchAttribute(attr) {
        return (!BROKEN_ATTR_IMPLEMENTATIONS || BROKEN_ATTR_IMPLEMENTATIONS.test(attr)) ?
                {className: createClassName(attr), applyClass: true} : null
    }

    // --[ log() ]----------------------------------------------------------
    // #DEBUG_START
    function log(message) {
        alert(message);
        if (win.console) {
            win.console.log(message);
        }
    }

    selectorMethod = determineSelectorMethod();
    init();


})(this);
