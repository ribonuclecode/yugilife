"use client"

import { forwardRef } from "react"

import { useSizeVariant } from "@/lib/size-context"

import { ComfortableSlider } from "./slider-comfortable"
import { CompactSlider } from "./slider-compact"
import { at, omitProps } from "./slider-engine"

import type { SliderEngineProps } from "./slider-engine"
import type { SizeVariant } from "@/lib/size-context"

type SliderCommonProps = Omit<SliderEngineProps, "value" | "onChange">

type SliderVariantProps = {
  variant?: "pips" | "scrubber"
  size?: SizeVariant
}

type SingleSliderProps = SliderCommonProps &
  SliderVariantProps & {
    value: number
    onChange: (value: number) => void
  }

type RangeSliderProps = SliderCommonProps &
  SliderVariantProps & {
    value: [number, number]
    onChange: (value: [number, number]) => void
  }

type SliderProps = SingleSliderProps | RangeSliderProps

function isSingleSliderProps(props: SliderProps): props is SingleSliderProps {
  return typeof props.value === "number"
}

const Slider = forwardRef<HTMLDivElement, SliderProps>(
  ({ size, variant = "pips", ...props }, ref) => {
    const resolved = useSizeVariant(size)
    const needsCompactEngine =
      Array.isArray(props.value) ||
      props.steps !== undefined ||
      props.showSteps !== undefined ||
      props.showValue !== undefined ||
      props.valuePosition !== undefined ||
      props.trackClassName !== undefined ||
      props.trackStyle !== undefined ||
      props.fillClassName !== undefined ||
      props.fillStyle !== undefined ||
      props.hideFill !== undefined ||
      props.thumbColor !== undefined ||
      props.thumbBorderColor !== undefined

    if (resolved === "compact" || needsCompactEngine) {
      let compactOnChange: SliderEngineProps["onChange"]
      if (isSingleSliderProps(props)) {
        compactOnChange = (nextValue) => {
          if (typeof nextValue === "number") props.onChange(nextValue)
        }
      } else {
        const rangeProps = props as RangeSliderProps
        compactOnChange = (nextValue) => {
          if (Array.isArray(nextValue)) rangeProps.onChange(nextValue)
        }
      }
      const compactProps: SliderEngineProps = {
        ...(props as SliderEngineProps),
        onChange: compactOnChange,
      }
      return <CompactSlider ref={ref} {...compactProps} />
    }

    if (!isSingleSliderProps(props)) {
      return <CompactSlider ref={ref} {...(props as SliderEngineProps)} />
    }

    const {
      value,
      onChange,
      min = 0,
      max = 100,
      step = 1,
      label,
      formatValue = String,
      disabled = false,
    } = props
    const html = omitProps(props, [
      "value",
      "onChange",
      "min",
      "max",
      "step",
      "label",
      "formatValue",
      "disabled",
      "steps",
      "showSteps",
      "showValue",
      "valuePosition",
      "trackClassName",
      "trackStyle",
      "fillClassName",
      "fillStyle",
      "hideFill",
      "thumbColor",
      "thumbBorderColor",
    ] as const)

    return (
      <ComfortableSlider
        ref={ref}
        value={typeof value === "number" ? value : at(value, 0)}
        onChange={onChange}
        min={min}
        max={max}
        step={step}
        variant={variant}
        formatValue={formatValue}
        disabled={disabled}
        {...(label === undefined ? {} : { label })}
        {...html}
      />
    )
  },
)

Slider.displayName = "Slider"
export { Slider }
export type { SliderProps }
