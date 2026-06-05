import { useEffect, useRef, type RefObject } from 'react'

/**
 * Minimalist-ui scroll entry animation hook.
 * - translateY(12px) + opacity:0 → settled over 600ms cubic-bezier(0.16, 1, 0.3, 1)
 * - IntersectionObserver (never scroll listeners)
 * - Staggered children via --index CSS variable × 80ms delay
 */

const EASE = 'cubic-bezier(0.16, 1, 0.3, 1)'
const DURATION = '600ms'
const STAGGER = 80 // ms per child

/* ── single element ─────────────────────────────────────────── */

export function useScrollReveal<T extends HTMLElement>(): RefObject<T | null> {
  const ref = useRef<T>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    // set initial hidden state
    el.style.opacity = '0'
    el.style.transform = 'translateY(12px)'
    el.style.transition = `opacity ${DURATION} ${EASE}, transform ${DURATION} ${EASE}`

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          el.style.opacity = '1'
          el.style.transform = 'translateY(0)'
          observer.unobserve(el)
        }
      },
      { threshold: 0.1 },
    )
    observer.observe(el)

    return () => observer.disconnect()
  }, [])

  return ref
}

/* ── staggered container ────────────────────────────────────── */

/**
 * Observes direct children of a container and staggers their reveal.
 * Each child gets --index set for CSS calc(var(--index) * 80ms) delays,
 * plus inline transition/transform/opacity as a fallback.
 */
export function useStaggerReveal<T extends HTMLElement>(): RefObject<T | null> {
  const ref = useRef<T>(null)

  useEffect(() => {
    const container = ref.current
    if (!container) return

    const children = Array.from(container.children) as HTMLElement[]
    if (!children.length) return

    // prepare each child
    children.forEach((child, i) => {
      child.style.setProperty('--index', String(i))
      child.style.opacity = '0'
      child.style.transform = 'translateY(12px)'
      child.style.transition = `opacity ${DURATION} ${EASE} ${i * STAGGER}ms, transform ${DURATION} ${EASE} ${i * STAGGER}ms`
    })

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return
        children.forEach((child) => {
          child.style.opacity = '1'
          child.style.transform = 'translateY(0)'
        })
        observer.unobserve(container)
      },
      { threshold: 0.1 },
    )
    observer.observe(container)

    return () => observer.disconnect()
  }, [])

  return ref
}
