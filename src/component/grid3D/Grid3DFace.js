import * as echarts from 'echarts/lib/echarts'
import graphicGL from 'echarts-gl/src/util/graphicGL'
import retrieve from 'echarts-gl/src/util/retrieve'
import Lines3DGeometry from 'echarts-gl/src/util/geometry/Lines3D'
import QuadsGeometry from 'echarts-gl/src/util/geometry/Quads'

/* eslint-disable */

const { firstNotNull } = retrieve

const dimIndicesMap = {
  // Left to right
  x: 0,
  // Far to near
  y: 2,
  // Bottom to up
  z: 1
}

function updateFacePlane(node, plane, otherAxis, dir) {
  const coord = [0, 0, 0]
  const distance = dir < 0 ? otherAxis.getExtentMin() : otherAxis.getExtentMax()
  coord[dimIndicesMap[otherAxis.dim]] = distance
  node.position.setArray(coord)
  node.rotation.identity()

  // Negative distance because on the opposite of normal direction.
  plane.distance = -Math.abs(distance)
  plane.normal.set(0, 0, 0)
  if (otherAxis.dim === 'x') {
    node.rotation.rotateY((dir * Math.PI) / 2)
    plane.normal.x = -dir
  } else if (otherAxis.dim === 'z') {
    node.rotation.rotateX((-dir * Math.PI) / 2)
    plane.normal.y = -dir
  } else {
    if (dir > 0) {
      node.rotation.rotateY(Math.PI)
    }
    plane.normal.z = -dir
  }
}

function Grid3DFace(faceInfo, linesMaterial, quadsMaterial) {
  this.rootNode = new graphicGL.Node()

  const linesMesh = new graphicGL.Mesh({
    geometry: new Lines3DGeometry({ useNativeLine: false }),
    material: linesMaterial,
    castShadow: false,
    ignorePicking: true,
    $ignorePicking: true,
    renderOrder: 1
  })
  const quadsMesh = new graphicGL.Mesh({
    geometry: new QuadsGeometry(),
    material: quadsMaterial,
    castShadow: false,
    culling: false,
    ignorePicking: true,
    $ignorePicking: true,
    renderOrder: 0
  })
  // Quads are behind lines.
  this.rootNode.add(quadsMesh)
  this.rootNode.add(linesMesh)

  this.faceInfo = faceInfo
  this.plane = new graphicGL.Plane()
  this.linesMesh = linesMesh
  this.quadsMesh = quadsMesh
}

Grid3DFace.prototype.update = function(grid3DModel, ecModel, api) {
  const cartesian = grid3DModel.coordinateSystem
  const axes = [cartesian.getAxis(this.faceInfo[0]), cartesian.getAxis(this.faceInfo[1])]
  const lineGeometry = this.linesMesh.geometry
  const quadsGeometry = this.quadsMesh.geometry

  lineGeometry.convertToDynamicArray(true)
  quadsGeometry.convertToDynamicArray(true)
  this._updateSplitLines(lineGeometry, axes, grid3DModel, api)
  this._udpateSplitAreas(quadsGeometry, axes, grid3DModel, api)
  lineGeometry.convertToTypedArray()
  quadsGeometry.convertToTypedArray()

  const otherAxis = cartesian.getAxis(this.faceInfo[2])
  updateFacePlane(this.rootNode, this.plane, otherAxis, this.faceInfo[3])
}

Grid3DFace.prototype._updateSplitLines = function(geometry, axes, grid3DModel, api) {
  const dpr = api.getDevicePixelRatio()

  const showColors = this.faceInfo[5] // jack add this line

  axes.forEach((axis, idx) => {
    const axisModel = axis.model
    const otherExtent = axes[1 - idx].getExtent()

    if (axis.scale.isBlank()) {
      return
    }

    const splitLineModel = axisModel.getModel('splitLine', grid3DModel.getModel('splitLine'))
    // Render splitLines
    if (splitLineModel.get('show')) {
      const lineStyleModel = splitLineModel.getModel('lineStyle')
      let lineColors = showColors ? lineStyleModel.get('color') : 'transparent'
      const opacity = firstNotNull(lineStyleModel.get('opacity'), 1.0)
      const lineWidth = firstNotNull(lineStyleModel.get('width'), 1.0)

      lineColors = echarts.util.isArray(lineColors) ? lineColors : [lineColors] // jack edit this line

      const ticksCoords = axis.getTicksCoords({
        tickModel: splitLineModel
      })

      let count = 0
      for (let i = 0; i < ticksCoords.length; i++) {
        const tickCoord = ticksCoords[i].coord
        const lineColor = graphicGL.parseColor(lineColors[count % lineColors.length])
        lineColor[3] *= opacity

        const p0 = [0, 0, 0]
        const p1 = [0, 0, 0]
        // 0 - x, 1 - y
        p0[idx] = p1[idx] = tickCoord
        p0[1 - idx] = otherExtent[0]
        p1[1 - idx] = otherExtent[1]

        geometry.addLine(p0, p1, lineColor, lineWidth * dpr)

        count++
      }
    }
  })
}

Grid3DFace.prototype._udpateSplitAreas = function(geometry, axes, grid3DModel, api) {
  // jack add this line
  const showColors = this.faceInfo[5]

  axes.forEach((axis, idx) => {
    const axisModel = axis.model
    const otherExtent = axes[1 - idx].getExtent()

    if (axis.scale.isBlank()) {
      return
    }

    const splitAreaModel = axisModel.getModel('splitArea', grid3DModel.getModel('splitArea'))
    // Render splitAreas
    if (splitAreaModel.get('show')) {
      const areaStyleModel = splitAreaModel.getModel('areaStyle')

      let colors = showColors ? areaStyleModel.get('color') : 'transparent' // jack edit this line

      const opacity = firstNotNull(areaStyleModel.get('opacity'), 1.0)

      colors = echarts.util.isArray(colors) ? colors : [colors]

      const ticksCoords = axis.getTicksCoords({
        tickModel: splitAreaModel,
        clamp: true
      })

      let count = 0
      let prevP0 = [0, 0, 0]
      let prevP1 = [0, 0, 0]
      // 0 - x, 1 - y
      for (let i = 0; i < ticksCoords.length; i++) {
        const tickCoord = ticksCoords[i].coord

        const p0 = [0, 0, 0]
        const p1 = [0, 0, 0]
        // 0 - x, 1 - y
        p0[idx] = p1[idx] = tickCoord
        p0[1 - idx] = otherExtent[0]
        p1[1 - idx] = otherExtent[1]

        if (i === 0) {
          prevP0 = p0
          prevP1 = p1
          continue
        }

        const color = graphicGL.parseColor(colors[count % colors.length])
        color[3] *= opacity
        geometry.addQuad([prevP0, p0, p1, prevP1], color)

        prevP0 = p0
        prevP1 = p1

        count++
      }
    }
  })
}

export default Grid3DFace
