import SignaturePad from '../../utils/signature_pad.js'
let signaturePad = {};
let pix = 7;
let penColor = 'black';
let lineWidth = 0.6;
Page({
    data: {
        penColor: 'black',
        lineWidth: 0.6,
        isEmpty: true
    },
    uploadScaleStart(e) {
        const item = {
            penColor: penColor,
            lineWidth: lineWidth
        };
        signaturePad._handleTouchStart(e, item);
    },
    uploadScaleMove(e) {
        signaturePad._handleTouchMove(e);
    },
    uploadScaleEnd: function(e) {
        signaturePad._handleTouchEnd(e);
        const isEmpty = signaturePad.isEmpty();
        this.setData({
            isEmpty: isEmpty
        })
    },
    retDraw: function() {
        signaturePad.clear();
        const isEmpty = signaturePad.isEmpty();
        this.setData({
            isEmpty: isEmpty
        })
    },
    onLoad: function(options) {
        var ctx = wx.createCanvasContext('handWriting');
        const data = {
            devicePixelRatio: pix,
        };
        signaturePad = new SignaturePad(ctx, data);
        console.info(ctx, SignaturePad);
    },
    getSysInfo: function() {
        var that = this
        wx.getSystemInfo({
            success: function(res) {
                pix = res.pixelRatio
                that.setData({
                    width: res.windowWidth * pix,
                    height: res.windowHeight * pix
                })
            }
        })
    },
    subCanvas: function() {
        if (this.data.isEmpty) {
            return false
        }
    }, //保存canvas图像
    onConfirm: function() {
        if (this.data.isEmpty) {
            return false
        }
        const self = this;
        wx.canvasToTempFilePath({
            canvasId: 'handWriting',
            success: function(res) {
                self.setData({
                    modalShow: false,
                    hiddenLoading: false
                })
                console.log(res.tempFilePath)
            },
            fail: function(res) {
                console.log(res)
            },
            complete: function(res) {
                console.log(res)
            }
        })
    }, //模态框保存签名操作
})