// TODO orthographic camera

import * as echarts from 'echarts/lib/echarts'
import { createTextStyle } from 'echarts/lib/label/labelStyle'
import graphicGL from 'echarts-gl/src//util/graphicGL'
import OrbitControl from 'echarts-gl/src//util/OrbitControl'
import Lines3DGeometry from 'echarts-gl/src//util/geometry/Lines3D'
import retrieve from 'echarts-gl/src/util/retrieve'
import ZRTextureAtlasSurface from 'echarts-gl/src//util/ZRTextureAtlasSurface'
import SceneHelper from 'echarts-gl/src/component/common/SceneHelper'
import Grid3DAxis from './Grid3DAxis'
import LabelsMesh from 'echarts-gl/src/util/mesh/LabelsMesh'

import lines3DGLSL from 'echarts-gl/src/util/shader/lines3D.glsl.js'
import Grid3DFace from './Grid3DFace'

/* eslint-disable */

const { firstNotNull } = retrieve

graphicGL.Shader.import(lines3DGLSL)

const dimIndicesMap = {
  // Left to right
  x: 0,
  // Far to near
  y: 2,
  // Bottom to up
  z: 1
}

export default echarts.ComponentView.extend({
  type: 'grid3D',

  __ecgl__: true,

  init(ecModel, api) {
    const FACES = [
      // planeDim0, planeDim1, offsetDim, dir on dim3 axis(gl), plane.
      ['y', 'z', 'x', -1, 'left'], // 1
      ['y', 'z', 'x', 1, 'right'],
      ['x', 'y', 'z', -1, 'bottom'], // 2
      ['x', 'y', 'z', 1, 'top'],
      ['x', 'z', 'y', -1, 'far'], // 3
      ['x', 'z', 'y', 1, 'near']
    ]

    // jack add this config start
    let showGridConfig = [true, true, true]
    if (ecModel.option.onlyOneGrid) {
      showGridConfig = ecModel.option.grid3D[0].showGridConfig || [true, true, true]
    }

    FACES.forEach(face => {
      if (face[0] === 'y') {
        face.push(showGridConfig[0])
      }
      if (face[1] === 'y') {
        face.push(showGridConfig[1])
      }
      if (face[2] === 'y') {
        face.push(showGridConfig[2])
      }
    })
    // jack add this config end

    const DIMS = ['x', 'y', 'z']

    const quadsMaterial = new graphicGL.Material({
      // transparent: true,
      shader: graphicGL.createShader('ecgl.color'),
      depthMask: false,
      transparent: true
    })
    const linesMaterial = new graphicGL.Material({
      // transparent: true,
      shader: graphicGL.createShader('ecgl.meshLines3D'),
      depthMask: false,
      transparent: true
    })
    quadsMaterial.define('fragment', 'DOUBLE_SIDED')
    quadsMaterial.define('both', 'VERTEX_COLOR')

    this.groupGL = new graphicGL.Node()

    this._control = new OrbitControl({
      zr: api.getZr()
    })
    this._control.init()

    // Save mesh and other infos for each face.
    this._faces = FACES.map(function(faceInfo) {
      const face = new Grid3DFace(faceInfo, linesMaterial, quadsMaterial)
      this.groupGL.add(face.rootNode)
      return face
    }, this)

    // Save mesh and other infos for each axis.
    this._axes = DIMS.map(function(dim) {
      const axis = new Grid3DAxis(dim, linesMaterial)
      this.groupGL.add(axis.rootNode)
      return axis
    }, this)

    const dpr = api.getDevicePixelRatio()
    // Texture surface for label.
    this._axisLabelSurface = new ZRTextureAtlasSurface({
      width: 256,
      height: 256,
      devicePixelRatio: dpr
    })
    this._axisLabelSurface.onupdate = function() {
      api.getZr().refresh()
    }

    this._axisPointerLineMesh = new graphicGL.Mesh({
      geometry: new Lines3DGeometry({ useNativeLine: false }),
      material: linesMaterial,
      castShadow: false,
      // PENDING
      ignorePicking: true,
      renderOrder: 3
    })
    this.groupGL.add(this._axisPointerLineMesh)

    this._axisPointerLabelsSurface = new ZRTextureAtlasSurface({
      width: 128,
      height: 128,
      devicePixelRatio: dpr
    })
    this._axisPointerLabelsMesh = new LabelsMesh({
      ignorePicking: true,
      renderOrder: 4,
      castShadow: false
    })
    this._axisPointerLabelsMesh.material.set('textureAtlas', this._axisPointerLabelsSurface.getTexture())
    this.groupGL.add(this._axisPointerLabelsMesh)

    this._lightRoot = new graphicGL.Node()
    this._sceneHelper = new SceneHelper()
    this._sceneHelper.initLight(this._lightRoot)
  },

  render(grid3DModel, ecModel, api) {
    this._model = grid3DModel
    this._api = api

    const cartesian = grid3DModel.coordinateSystem

    // Always have light.
    cartesian.viewGL.add(this._lightRoot)

    if (grid3DModel.get('show')) {
      cartesian.viewGL.add(this.groupGL)
    } else {
      cartesian.viewGL.remove(this.groupGL)
    }

    // cartesian.viewGL.setCameraType(grid3DModel.get('viewControl.projection'));

    const control = this._control
    control.setViewGL(cartesian.viewGL)

    const viewControlModel = grid3DModel.getModel('viewControl')
    control.setFromViewControlModel(viewControlModel, 0)

    const isPRPS= grid3DModel?.option?.isPRPS ?? false
    const shouldUpdateLabel = grid3DModel?.option?.shouldUpdateLabel ?? false

    const isPRPSRefresh = (isPRPS && shouldUpdateLabel)

    if (!isPRPSRefresh) {
      this._axisLabelSurface.clear()
    } 

    control.off('update')
    if (grid3DModel.get('show')) {
      this._faces.forEach(face => {
        face.update(grid3DModel, ecModel, api)
      }, this)

      const camera = this._control.getCamera()
      const coords = [new graphicGL.Vector4(), new graphicGL.Vector4()]
      const center = new graphicGL.Vector4()
      this.groupGL.getWorldPosition(center)
      center.w = 1.0
      center.transformMat4(camera.viewMatrix).transformMat4(camera.projectionMatrix)
      center.x /= center.w
      center.y /= center.w

      this._axes.forEach(function(axis) {

        let textAlign
        let verticalAlign

        const axisInfo = axis
        const lineCoords = axisInfo?.axisLineCoords ?? null
        
        if (lineCoords) {
          for (let i = 0; i < coords.length; i++) {
            coords[i].setArray(lineCoords[i])
            coords[i].w = 1.0
            coords[i]
              .transformMat4(axisInfo.rootNode.worldTransform)
              .transformMat4(camera.viewMatrix)
              .transformMat4(camera.projectionMatrix)
            coords[i].x /= coords[i].w
            coords[i].y /= coords[i].w
          }
          const dx = coords[1].x - coords[0].x
          const dy = coords[1].y - coords[0].y
          const cx = (coords[1].x + coords[0].x) / 2
          const cy = (coords[1].y + coords[0].y) / 2
    
          if (Math.abs(dy / dx) < 0.5) {
            textAlign = 'center'
            verticalAlign = cy > center.y ? 'bottom' : 'top'
          } else {
            verticalAlign = 'middle'
            textAlign = cx > center.x ? 'left' : 'right'
          }
        }

        if (!isPRPSRefresh) {
          axis.update(grid3DModel, this._axisLabelSurface, api, textAlign, verticalAlign, isPRPS)
        }
      }, this)
    }

    control.on('update', this._onCameraChange.bind(this, grid3DModel, api), this)

    this._sceneHelper.setScene(cartesian.viewGL.scene)
    this._sceneHelper.updateLight(grid3DModel)

    // Set post effect
    cartesian.viewGL.setPostEffect(grid3DModel.getModel('postEffect'), api)
    cartesian.viewGL.setTemporalSuperSampling(grid3DModel.getModel('temporalSuperSampling'))

    this._initMouseHandler(grid3DModel)

    if (
      // jack add this
      Reflect.has(grid3DModel.option, 'afterRenderedUpdateAxisPosition') &&
      grid3DModel.option.afterRenderedUpdateAxisPosition
    ) {
      this._updateAxisLinePosition()
    }
  },

  afterRender(grid3DModel, ecModel, api, layerGL) {
    // Create ambient cubemap after render because we need to know the renderer.
    // TODO
    const { renderer } = layerGL

    this._sceneHelper.updateAmbientCubemap(renderer, grid3DModel, api)

    this._sceneHelper.updateSkybox(renderer, grid3DModel, api)
  },

  /**
   * showAxisPointer will be triggered by action.
   */
  showAxisPointer(grid3dModel, ecModel, api, payload) {
    this._doShowAxisPointer()
    this._updateAxisPointer(payload.value)
  },

  /**
   * hideAxisPointer will be triggered by action.
   */
  hideAxisPointer(grid3dModel, ecModel, api, payload) {
    this._doHideAxisPointer()
  },

  _initMouseHandler(grid3DModel) {
    const cartesian = grid3DModel.coordinateSystem
    const { viewGL } = cartesian

    // TODO xAxis3D.axisPointer.show ?
    if (grid3DModel.get('show') && grid3DModel.get('axisPointer.show')) {
      viewGL.on('mousemove', this._updateAxisPointerOnMousePosition, this)
    } else {
      viewGL.off('mousemove', this._updateAxisPointerOnMousePosition)
    }
  },

  /**
   * Try find and show axisPointer on the intersect point
   * of mouse ray with grid plane.
   */
  _updateAxisPointerOnMousePosition(e) {
    // Ignore if mouse is on the element.
    if (e.target) {
      return
    }
    const grid3DModel = this._model
    const cartesian = grid3DModel.coordinateSystem
    const { viewGL } = cartesian

    const ray = viewGL.castRay(e.offsetX, e.offsetY, new graphicGL.Ray())

    let nearestIntersectPoint
    for (let i = 0; i < this._faces.length; i++) {
      const face = this._faces[i]
      if (face.rootNode.invisible) {
        continue
      }

      // Plane is not face the camera. flip it
      if (face.plane.normal.dot(viewGL.camera.worldTransform.z) < 0) {
        face.plane.normal.negate()
      }

      const point = ray.intersectPlane(face.plane)
      if (!point) {
        continue
      }
      const axis0 = cartesian.getAxis(face.faceInfo[0])
      const axis1 = cartesian.getAxis(face.faceInfo[1])
      const idx0 = dimIndicesMap[face.faceInfo[0]]
      const idx1 = dimIndicesMap[face.faceInfo[1]]
      if (axis0.contain(point.array[idx0]) && axis1.contain(point.array[idx1])) {
        nearestIntersectPoint = point
      }
    }

    if (nearestIntersectPoint) {
      const data = cartesian.pointToData(nearestIntersectPoint.array, [], true)
      this._updateAxisPointer(data)

      this._doShowAxisPointer()
    } else {
      this._doHideAxisPointer()
    }
  },

  _onCameraChange(grid3DModel, api) {
    if (grid3DModel.get('show')) {
      this._updateFaceVisibility()
      this._updateAxisLinePosition()
    }

    const control = this._control

    api.dispatchAction({
      type: 'grid3DChangeCamera',
      alpha: control.getAlpha(),
      beta: control.getBeta(),
      distance: control.getDistance(),
      center: control.getCenter(),
      from: this.uid,
      grid3DId: grid3DModel.id
    })
  },

  /**
   * Update visibility of each face when camera view changed, front face will be invisible.
   * @private
   */
  _updateFaceVisibility() {
    const camera = this._control.getCamera()
    const viewSpacePos = new graphicGL.Vector3()
    camera.update()
    for (let idx = 0; idx < this._faces.length / 2; idx++) {
      const depths = []
      for (let k = 0; k < 2; k++) {
        const face = this._faces[idx * 2 + k]
        face.rootNode.getWorldPosition(viewSpacePos)
        viewSpacePos.transformMat4(camera.viewMatrix)
        depths[k] = viewSpacePos.z
      }
      // Set the front face invisible
      const frontIndex = depths[0] > depths[1] ? 0 : 1
      const frontFace = this._faces[idx * 2 + frontIndex]
      const backFace = this._faces[idx * 2 + 1 - frontIndex]
      // Update rotation.
      frontFace.rootNode.invisible = true
      backFace.rootNode.invisible = false
    }
  },

  /**
   * Update axis line position when camera view changed.
   * @private
   */
  _updateAxisLinePosition() {
    // Put xAxis, yAxis on x, y visible plane.
    // Put zAxis on the left.
    // TODO
    const cartesian = this._model.coordinateSystem
    const xAxis = cartesian.getAxis('x')
    const yAxis = cartesian.getAxis('y')
    const zAxis = cartesian.getAxis('z')
    const top = zAxis.getExtentMax()
    const bottom = zAxis.getExtentMin()
    const left = xAxis.getExtentMin()
    const right = xAxis.getExtentMax()
    const near = yAxis.getExtentMax()
    const far = yAxis.getExtentMin()

    const xAxisNode = this._axes[0].rootNode
    const yAxisNode = this._axes[1].rootNode
    const zAxisNode = this._axes[2].rootNode

    const faces = this._faces
    // Notice: in cartesian up axis is z, but in webgl up axis is y.
    const xAxisZOffset = faces[4].rootNode.invisible ? far : near
    const xAxisYOffset = faces[2].rootNode.invisible ? top : bottom
    const yAxisXOffset = faces[0].rootNode.invisible ? left : right
    const yAxisYOffset = faces[2].rootNode.invisible ? top : bottom
    const zAxisXOffset = faces[0].rootNode.invisible ? right : left
    const zAxisZOffset = faces[4].rootNode.invisible ? far : near

    xAxisNode.rotation.identity()
    yAxisNode.rotation.identity()
    zAxisNode.rotation.identity()
    if (faces[4].rootNode.invisible) {
      this._axes[0].flipped = true
      xAxisNode.rotation.rotateX(Math.PI)
    }
    if (faces[0].rootNode.invisible) {
      this._axes[1].flipped = true
      yAxisNode.rotation.rotateZ(Math.PI)
    }
    if (faces[4].rootNode.invisible) {
      this._axes[2].flipped = true
      zAxisNode.rotation.rotateY(Math.PI)
    }

    xAxisNode.position.set(0, xAxisYOffset, xAxisZOffset)
    yAxisNode.position.set(yAxisXOffset, yAxisYOffset, 0) // Actually z
    zAxisNode.position.set(zAxisXOffset, 0, zAxisZOffset) // Actually y

    xAxisNode.update()
    yAxisNode.update()
    zAxisNode.update()

    this._updateAxisLabelAlign()
  },

  /**
   * Update label align on axis when axisLine position changed.
   * @private
   */
  _updateAxisLabelAlign() {
    // var cartesian = this._model.coordinateSystem;
    const camera = this._control.getCamera()
    const coords = [new graphicGL.Vector4(), new graphicGL.Vector4()]
    const center = new graphicGL.Vector4()
    this.groupGL.getWorldPosition(center)
    center.w = 1.0
    center.transformMat4(camera.viewMatrix).transformMat4(camera.projectionMatrix)
    center.x /= center.w
    center.y /= center.w
    this._axes.forEach(function(axisInfo) {
      const lineCoords = axisInfo.axisLineCoords

      const labelGeo = axisInfo.labelsMesh.geometry
      for (let i = 0; i < coords.length; i++) {
        coords[i].setArray(lineCoords[i])
        coords[i].w = 1.0
        coords[i]
          .transformMat4(axisInfo.rootNode.worldTransform)
          .transformMat4(camera.viewMatrix)
          .transformMat4(camera.projectionMatrix)
        coords[i].x /= coords[i].w
        coords[i].y /= coords[i].w
      }
      const dx = coords[1].x - coords[0].x
      const dy = coords[1].y - coords[0].y
      const cx = (coords[1].x + coords[0].x) / 2
      const cy = (coords[1].y + coords[0].y) / 2
      let textAlign
      let verticalAlign
      if (Math.abs(dy / dx) < 0.5) {
        textAlign = 'center'
        verticalAlign = cy > center.y ? 'bottom' : 'top'
      } else {
        verticalAlign = 'middle'
        textAlign = cx > center.x ? 'left' : 'right'
      }

        // axis labels
        axisInfo.setSpriteAlign(textAlign, verticalAlign, this._api)
    }, this)
  },

  _doShowAxisPointer() {
    if (!this._axisPointerLineMesh.invisible) {
      return
    }

    this._axisPointerLineMesh.invisible = false
    this._axisPointerLabelsMesh.invisible = false
    this._api.getZr().refresh()
  },

  _doHideAxisPointer() {
    if (this._axisPointerLineMesh.invisible) {
      return
    }

    this._axisPointerLineMesh.invisible = true
    this._axisPointerLabelsMesh.invisible = true
    this._api.getZr().refresh()
  },
  /**
   * @private updateAxisPointer.
   */
  _updateAxisPointer(data) {
    const cartesian = this._model.coordinateSystem
    const point = cartesian.dataToPoint(data)

    const axisPointerLineMesh = this._axisPointerLineMesh
    const linesGeo = axisPointerLineMesh.geometry

    const axisPointerParentModel = this._model.getModel('axisPointer')

    const dpr = this._api.getDevicePixelRatio()
    linesGeo.convertToDynamicArray(true)

    function ifShowAxisPointer(axis) {
      return retrieve.firstNotNull(axis.model.get('axisPointer.show'), axisPointerParentModel.get('show'))
    }
    function getAxisColorAndLineWidth(axis) {
      const axisPointerModel = axis.model.getModel('axisPointer', axisPointerParentModel)
      const lineStyleModel = axisPointerModel.getModel('lineStyle')

      const color = graphicGL.parseColor(lineStyleModel.get('color'))
      const lineWidth = firstNotNull(lineStyleModel.get('width'), 1)
      const opacity = firstNotNull(lineStyleModel.get('opacity'), 1)
      color[3] *= opacity

      return {
        color,
        lineWidth
      }
    }
    for (let k = 0; k < this._faces.length; k++) {
      const face = this._faces[k]
      if (face.rootNode.invisible) {
        continue
      }

      const { faceInfo } = face
      const otherCoord =
        faceInfo[3] < 0 ? cartesian.getAxis(faceInfo[2]).getExtentMin() : cartesian.getAxis(faceInfo[2]).getExtentMax()
      const otherDimIdx = dimIndicesMap[faceInfo[2]]

      // Line on face.
      for (let i = 0; i < 2; i++) {
        const dim = faceInfo[i]
        const faceOtherDim = faceInfo[1 - i]
        const axis = cartesian.getAxis(dim)
        const faceOtherAxis = cartesian.getAxis(faceOtherDim)

        if (!ifShowAxisPointer(axis)) {
          continue
        }

        var p0 = [0, 0, 0]
        var p1 = [0, 0, 0]
        const dimIdx = dimIndicesMap[dim]
        const faceOtherDimIdx = dimIndicesMap[faceOtherDim]
        p0[dimIdx] = p1[dimIdx] = point[dimIdx]

        p0[otherDimIdx] = p1[otherDimIdx] = otherCoord
        p0[faceOtherDimIdx] = faceOtherAxis.getExtentMin()
        p1[faceOtherDimIdx] = faceOtherAxis.getExtentMax()

        var colorAndLineWidth = getAxisColorAndLineWidth(axis)
        linesGeo.addLine(p0, p1, colorAndLineWidth.color, colorAndLineWidth.lineWidth * dpr)
      }

      // Project line.
      if (ifShowAxisPointer(cartesian.getAxis(faceInfo[2]))) {
        var p0 = point.slice()
        var p1 = point.slice()
        p1[otherDimIdx] = otherCoord
        var colorAndLineWidth = getAxisColorAndLineWidth(cartesian.getAxis(faceInfo[2]))
        linesGeo.addLine(p0, p1, colorAndLineWidth.color, colorAndLineWidth.lineWidth * dpr)
      }
    }
    linesGeo.convertToTypedArray()

    this._updateAxisPointerLabelsMesh(data)

    this._api.getZr().refresh()
  },

  _updateAxisPointerLabelsMesh(data) {
    const grid3dModel = this._model
    const axisPointerLabelsMesh = this._axisPointerLabelsMesh
    const axisPointerLabelsSurface = this._axisPointerLabelsSurface
    const cartesian = grid3dModel.coordinateSystem

    const axisPointerParentModel = grid3dModel.getModel('axisPointer')

    axisPointerLabelsMesh.geometry.convertToDynamicArray(true)
    axisPointerLabelsSurface.clear()

    const otherDim = {
      x: 'y',
      y: 'x',
      z: 'y'
    }
    this._axes.forEach(function(axisInfo, idx) {
      const axis = cartesian.getAxis(axisInfo.dim)
      const axisModel = axis.model
      const axisPointerModel = axisModel.getModel('axisPointer', axisPointerParentModel)
      const labelModel = axisPointerModel.getModel('label')
      const lineColor = axisPointerModel.get('lineStyle.color')
      if (!labelModel.get('show') || !axisPointerModel.get('show')) {
        return
      }
      const val = data[idx]
      const formatter = labelModel.get('formatter')
      let text = axis.scale.getLabel({ value: val })
      if (formatter != null) {
        text = formatter(text, data)
      } else if (axis.scale.type === 'interval' || axis.scale.type === 'log') {
        const precision = echarts.number.getPrecisionSafe(axis.scale.getTicks()[0])
        text = val.toFixed(precision + 2)
      }

      const labelColor = labelModel.get('color')
      const textEl = new echarts.graphic.Text({
        style: createTextStyle(labelModel, {
          text,
          fill: labelColor || lineColor,
          align: 'left',
          verticalAlign: 'top'
        })
      })

      const coords = axisPointerLabelsSurface.add(textEl)
      const rect = textEl.getBoundingRect()
      const dpr = this._api.getDevicePixelRatio()
      const pos = axisInfo.rootNode.position.toArray()
      const otherIdx = dimIndicesMap[otherDim[axisInfo.dim]]
      pos[otherIdx] += (axisInfo.flipped ? -1 : 1) * labelModel.get('margin')
      pos[dimIndicesMap[axisInfo.dim]] = axis.dataToCoord(data[idx])

      axisPointerLabelsMesh.geometry.addSprite(
        pos,
        [rect.width * dpr, rect.height * dpr],
        coords,
        axisInfo.textAlign,
        axisInfo.textVerticalAlign
      )
    }, this)
    axisPointerLabelsSurface.getZr().refreshImmediately()
    axisPointerLabelsMesh.material.set('uvScale', axisPointerLabelsSurface.getCoordsScale())
    axisPointerLabelsMesh.geometry.convertToTypedArray()
  },

  dispose() {
    this.groupGL.removeAll()
    this._control.dispose()
    this._axisLabelSurface.dispose()
    this._axisPointerLabelsSurface.dispose()
  }
})
