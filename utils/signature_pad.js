/*!
 * Signature Pad v2.2.0
 * https://github.com/szimek/signature_pad
 *
 * Copyright 2017 Szymon Nowak
 * Released under the MIT license
 *
 * The main idea and some parts of the code (e.g. drawing variable width Bézier curve) are taken from:
 * http://corner.squareup.com/2012/07/smoother-signatures.html
 *
 * Implementation of interpolation using cubic Bézier curves is taken from:
 * http://benknowscode.wordpress.com/2012/09/14/path-interpolation-using-cubic-bezier-and-control-point-estimation-in-javascript
 *
 * Algorithm for approximated length of a Bézier curve is taken from:
 * http://www.lemoda.net/maths/bezier-length/index.html
 *
 */

(function(global, factory) {
    typeof exports === 'object' && typeof module !== 'undefined' ? module.exports = factory() :
        typeof define === 'function' && define.amd ? define(factory) :
        (global.SignaturePad = factory());
}(this, (function() {
    'use strict';

    function Point(x, y, time) {
        this.x = x;
        this.y = y;
        this.time = time || new Date().getTime();
    }

    Point.prototype.velocityFrom = function(start) {
        return this.time !== start.time ? this.distanceTo(start) / (this.time - start.time) : 1;
    };

    Point.prototype.distanceTo = function(start) {
        return Math.sqrt(Math.pow(this.x - start.x, 2) + Math.pow(this.y - start.y, 2));
    };

    function Bezier(startPoint, control1, control2, endPoint) {
        this.startPoint = startPoint;
        this.control1 = control1;
        this.control2 = control2;
        this.endPoint = endPoint;
    }

    // Returns approximated length.
    Bezier.prototype.length = function() {
        var steps = 10;
        var length = 0;
        var px = void 0;
        var py = void 0;

        for (var i = 0; i <= steps; i += 1) {
            var t = i / steps;
            var cx = this._point(t, this.startPoint.x, this.control1.x, this.control2.x, this.endPoint.x);
            var cy = this._point(t, this.startPoint.y, this.control1.y, this.control2.y, this.endPoint.y);
            if (i > 0) {
                var xdiff = cx - px;
                var ydiff = cy - py;
                length += Math.sqrt(xdiff * xdiff + ydiff * ydiff);
            }
            px = cx;
            py = cy;
        }

        return length;
    };

    /* eslint-disable no-multi-spaces, space-in-parens */
    Bezier.prototype._point = function(t, start, c1, c2, end) {
        return start * (1.0 - t) * (1.0 - t) * (1.0 - t) + 3.0 * c1 * (1.0 - t) * (1.0 - t) * t + 3.0 * c2 * (1.0 - t) * t * t + end * t * t * t;
    };

    /* eslint-disable */

    // http://stackoverflow.com/a/27078401/815507
    function throttle(func, wait, options) {
        var context, args, result;
        var timeout = null;
        var previous = 0;
        if (!options) options = {};
        var later = function later() {
            previous = options.leading === false ? 0 : Date.now();
            timeout = null;
            result = func.apply(context, args);
            if (!timeout) context = args = null;
        };
        return function() {
            var now = Date.now();
            if (!previous && options.leading === false) previous = now;
            var remaining = wait - (now - previous);
            context = this;
            args = arguments;
            if (remaining <= 0 || remaining > wait) {
                if (timeout) {
                    clearTimeout(timeout);
                    timeout = null;
                }
                previous = now;
                result = func.apply(context, args);
                if (!timeout) context = args = null;
            } else if (!timeout && options.trailing !== false) {
                timeout = setTimeout(later, remaining);
            }
            return result;
        };
    }

    function SignaturePad(canvas, options) {
        var self = this;
        var opts = options || {};

        this.velocityFilterWeight = opts.velocityFilterWeight || 0.7;
        this.minWidth = opts.minWidth || 0.5;
        this.maxWidth = opts.maxWidth || 2.5;
        this.throttle = 'throttle' in opts ? opts.throttle : 16; // in miliseconds

        if (this.throttle) {
            this._strokeMoveUpdate = throttle(SignaturePad.prototype._strokeUpdate, this.throttle);
        } else {
            this._strokeMoveUpdate = SignaturePad.prototype._strokeUpdate;
        }

        this.dotSize = opts.dotSize || function() {
            return (this.minWidth + this.maxWidth) / 2;
        };
        this.penColor = opts.penColor || 'black'; //签字板的颜色
        this.backgroundColor = opts.backgroundColor || 'rgba(0,0,0,0)';
        this.onBegin = opts.onBegin;
        this.onEnd = opts.onEnd;
        this.devicePixelRatio = opts.devicePixelRatio || 1;
        this.lineWidth = opts.lineWidth || 1; //签字板的粗细
        this._canvas = canvas;
        this._ctx = canvas;
        this.clear();

        // We need add these inline so they are available to unbind while still having
        // access to 'self' we could use _.bind but it's not worth adding a dependency.

        this._handleTouchStart = function(event, data) {
            self.penColor = data.penColor || self.penColor;
            self.lineWidth = data.lineWidth || self.lineWidth;
            if (event.touches.length === 1) {
                var touch = event.changedTouches[0];
                self._strokeBegin(touch);
            }
        };

        this._handleTouchMove = function(event) {
            // Prevent scrolling.
            var touch = event.touches[0];
            self._strokeMoveUpdate(touch);
        };

        this._handleTouchEnd = function(event) {
            self._strokeEnd(event);
        };
        this.clear = function() {
            var ctx = this._ctx;
            var canvas = this._canvas;

            ctx.fillStyle = this.backgroundColor;
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.draw()
            this._data = [];
            this._reset();
            this._isEmpty = true;
        };
    }

    // Public methods
    SignaturePad.prototype.clear = function() {
        var ctx = this._ctx;
        var canvas = this._canvas;

        ctx.fillStyle = this.backgroundColor;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        this._data = [];
        this._reset();
        this._isEmpty = true;
    };

    SignaturePad.prototype.isEmpty = function() {
        return this._isEmpty;
    };

    // Private methods
    SignaturePad.prototype._strokeBegin = function(event) {
        this._data.push([]);
        this._reset();
        this._strokeUpdate(event);

        if (typeof this.onBegin === 'function') {
            this.onBegin(event);
        }
    };

    SignaturePad.prototype._strokeUpdate = function(event) {
        var x = event.x;
        var y = event.y;

        var point = this._createPoint(x, y);

        var _addPoint = this._addPoint(point),
            curve = _addPoint.curve,
            widths = _addPoint.widths;

        if (curve && widths) {
            this._drawCurve(curve, widths.start, widths.end);
        }
        this._data[this._data.length - 1].push({
            x: point.x,
            y: point.y,
            time: point.time,
            color: this.penColor
        });
    };

    SignaturePad.prototype._strokeEnd = function(event) {
        var canDrawCurve = this.points.length > 2;
        var point = this.points[0];

        if (!canDrawCurve && point) {
            this._drawDot(point);
        }

        if (typeof this.onEnd === 'function') {
            this.onEnd(event);
        }
    };

    SignaturePad.prototype._reset = function() {
        this.points = [];
        this._lastVelocity = 0;
        this._lastWidth = (this.minWidth + this.maxWidth) / 2;
        this._ctx.fillStyle = this.penColor;
    };

    SignaturePad.prototype._createPoint = function(x, y, time) {
        var rect = {
            left: 10,
            top: 10
        };
        return new Point(x - rect.left, y - rect.top, time || new Date().getTime());
    };

    SignaturePad.prototype._addPoint = function(point) {
        var points = this.points;
        var tmp = void 0;

        points.push(point);
        if (points.length > 2) {
            // To reduce the initial lag make it work with 3 points
            // by copying the first point to the beginning.
            if (points.length === 3) points.unshift(points[0]);

            tmp = this._calculateCurveControlPoints(points[0], points[1], points[2]);
            var c2 = tmp.c2;
            tmp = this._calculateCurveControlPoints(points[1], points[2], points[3]);
            var c3 = tmp.c1;
            var curve = new Bezier(points[1], c2, c3, points[2]);
            var widths = this._calculateCurveWidths(curve);
            // Remove the first element from the list,
            // so that we always have no more than 4 points in points array.
            points.shift();

            return { curve: curve, widths: widths };
        }

        return {};
    };

    SignaturePad.prototype._calculateCurveControlPoints = function(s1, s2, s3) {
        var dx1 = s1.x - s2.x;
        var dy1 = s1.y - s2.y;
        var dx2 = s2.x - s3.x;
        var dy2 = s2.y - s3.y;
        var m1 = { x: (s1.x + s2.x) / 2.0, y: (s1.y + s2.y) / 2.0 };
        var m2 = { x: (s2.x + s3.x) / 2.0, y: (s2.y + s3.y) / 2.0 };

        var l1 = Math.sqrt(dx1 * dx1 + dy1 * dy1);
        var l2 = Math.sqrt(dx2 * dx2 + dy2 * dy2);

        var dxm = m1.x - m2.x;
        var dym = m1.y - m2.y;

        var k = l2 / (l1 + l2);
        var cm = { x: m2.x + dxm * k, y: m2.y + dym * k };

        var tx = s2.x - cm.x;
        var ty = s2.y - cm.y;

        return {
            c1: new Point(m1.x + tx, m1.y + ty),
            c2: new Point(m2.x + tx, m2.y + ty)
        };
    };

    SignaturePad.prototype._calculateCurveWidths = function(curve) {
        var startPoint = curve.startPoint;
        var endPoint = curve.endPoint;
        var widths = { start: null, end: null };

        var velocity = this.velocityFilterWeight * endPoint.velocityFrom(startPoint) + (1 - this.velocityFilterWeight) * this._lastVelocity;

        var newWidth = this._strokeWidth(velocity);

        widths.start = this._lastWidth;
        widths.end = newWidth;

        this._lastVelocity = velocity;
        this._lastWidth = newWidth;

        return widths;
    };

    SignaturePad.prototype._strokeWidth = function(velocity) {
        return Math.max(this.maxWidth / (velocity + 1), this.minWidth);
    };

    SignaturePad.prototype._drawPoint = function(x, y, size) {
        var ctx = this._ctx;
        var lineWidth = this.lineWidth;
        ctx.moveTo(x, y);
        ctx.arc(x, y, size * lineWidth, 0, 2 * Math.PI, false);
        this._isEmpty = false;
    };

    SignaturePad.prototype._drawCurve = function(curve, startWidth, endWidth) {
        var ctx = this._ctx;
        var widthDelta = endWidth - startWidth;
        var drawSteps = Math.floor(curve.length());

        ctx.beginPath();
        for (var i = 0; i < drawSteps; i += 1) {
            // Calculate the Bezier (x, y) coordinate for this step.
            var t = i / drawSteps;
            var tt = t * t;
            var ttt = tt * t;
            var u = 1 - t;
            var uu = u * u;
            var uuu = uu * u;

            var x = uuu * curve.startPoint.x;
            x += 3 * uu * t * curve.control1.x;
            x += 3 * u * tt * curve.control2.x;
            x += ttt * curve.endPoint.x;

            var y = uuu * curve.startPoint.y;
            y += 3 * uu * t * curve.control1.y;
            y += 3 * u * tt * curve.control2.y;
            y += ttt * curve.endPoint.y;

            var width = startWidth + ttt * widthDelta;
            this._drawPoint(x, y, width);
        }
        var penColor = this.penColor;
        ctx.closePath();
        ctx.setStrokeStyle(penColor);
        ctx.setFillStyle(penColor);
        ctx.fill();
        ctx.stroke();
        ctx.draw(true)
    };

    SignaturePad.prototype._drawDot = function(point) {
        var ctx = this._ctx;
        var width = typeof this.dotSize === 'function' ? this.dotSize() : this.dotSize;
        var penColor = this.penColor;
        ctx.beginPath();
        this._drawPoint(point.x, point.y, width);
        ctx.closePath();
        ctx.setStrokeStyle(penColor);
        ctx.setFillStyle(penColor);
        ctx.fill();
        ctx.stroke();
        ctx.draw(true)
    };

    SignaturePad.prototype.toData = function() {
        return this._data;
    };

    return SignaturePad;

})));