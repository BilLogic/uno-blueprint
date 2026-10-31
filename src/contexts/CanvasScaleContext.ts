import { createContext, useContext } from 'react'

export const CanvasScaleContext = createContext(1)
export const useCanvasScale = () => useContext(CanvasScaleContext)
