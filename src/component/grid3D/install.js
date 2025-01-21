// TODO ECharts GL must be imported whatever component,charts is imported.
import 'echarts-gl/src/echarts-gl'

import Grid3DModel from 'echarts-gl/src/component/grid3D/Grid3DModel'
import grid3DCreator from 'echarts-gl/src/coord/grid3DCreator'
import Axis3DModel from 'echarts-gl/src/component/grid3D/Axis3DModel'
import createAxis3DModel from 'echarts-gl/src/component/grid3D/createAxis3DModel'
import Grid3DView from './Grid3DView'

/* eslint-disable */

function getAxisType(axisDim, option) {
  // Default axis with data is category axis
  return option.type || (option.data ? 'category' : 'value')
}
export function install(registers) {
  registers.registerComponentModel(Grid3DModel)
  registers.registerComponentView(Grid3DView)

  registers.registerCoordinateSystem('grid3D', grid3DCreator)
  ;['x', 'y', 'z'].forEach(dim => {
    createAxis3DModel(registers, dim, Axis3DModel, getAxisType, {
      name: dim.toUpperCase()
    })
    const AxisView = registers.ComponentView.extend({
      type: `${dim}Axis3D`
    })
    registers.registerComponentView(AxisView)
  })

  registers.registerAction(
    {
      type: 'grid3DChangeCamera',
      event: 'grid3dcamerachanged',
      update: 'series:updateCamera'
    },
    (payload, ecModel) => {
      ecModel.eachComponent(
        {
          mainType: 'grid3D',
          query: payload
        },
        componentModel => {
          componentModel.setView(payload)
        }
      )
    }
  )

  registers.registerAction(
    {
      type: 'grid3DShowAxisPointer',
      event: 'grid3dshowaxispointer',
      update: 'grid3D:showAxisPointer'
    },
    (payload, ecModel) => {}
  )

  registers.registerAction(
    {
      type: 'grid3DHideAxisPointer',
      event: 'grid3dhideaxispointer',
      update: 'grid3D:hideAxisPointer'
    },
    (payload, ecModel) => {}
  )
}
