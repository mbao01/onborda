"use client";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { motion, MotionConfig } from "motion/react";
import { Portal } from "@radix-ui/react-portal";
import { cn } from "@mbao01/common/utilities";
import { useOnborda } from "./OnbordaContext";

// Types
import { OnbordaProps, Step } from "./types";
import { getCardStyle, getArrowStyle } from "./OnbordaStyles";

/**
 * Onborda Component
 * @param {OnbordaProps} props
 * @constructor
 */
const Onborda: React.FC<OnbordaProps> = ({
  classes,
  children,
  cardTransition = { ease: "anticipate", duration: 0.6 },
  cardComponent: CardComponent,
  tourComponent: TourComponent,
  debug = false,
  observerTimeout = 5000,
}: OnbordaProps) => {
  const {
    currentTour,
    currentStep,
    setCurrentStep,
    isOnbordaVisible,
    currentTourSteps,
    completedSteps,
    setCompletedSteps,
    tours,
    closeOnborda,
    setOnbordaVisible,
  } = useOnborda();

  const [elementToScroll, setElementToScroll] = useState<Element | null>(null);
  const [pointerPosition, setPointerPosition] = useState<{
    x: number;
    y: number;
    width: number;
    height: number;
  } | null>(null);
  const currentElementRef = useRef<Element | null>(null);

  // - -
  // Route Changes
  const router = useRouter();
  const path = usePathname();
  const [currentRoute, setCurrentRoute] = useState<string | null>(path);
  const [pendingRouteChange, setPendingRouteChange] = useState(false);

  const hasSelector = (step: Step): boolean => {
    return !!step?.selector || !!step?.customQuerySelector;
  };
  const getStepSelectorElement = (step: Step): Element | null => {
    return step?.selector
      ? document.querySelector(step.selector)
      : step?.customQuerySelector
      ? step.customQuerySelector()
      : null;
  };

  // Get the current tour object
  const currentTourObject = useMemo(() => {
    return tours.find((tour) => tour.tour === currentTour);
  }, [currentTour, isOnbordaVisible]);

  // Update the current route on route changes
  useEffect(() => {
    !pendingRouteChange && setCurrentRoute(path);
  }, [path, pendingRouteChange]);

  // - -
  // Initialisze
  useEffect(() => {
    let cleanup: any[] = [];
    if (isOnbordaVisible && currentTourSteps) {
      debug &&
        console.log(
          "Onborda: Current Step Changed",
          currentStep,
          completedSteps
        );
      const step = currentTourSteps[currentStep];
      if (step) {
        let elementFound = false;
        // Check if the step has a selector
        if (hasSelector(step)) {
          // This step has a selector. Lets find the element
          const element = getStepSelectorElement(step);
          // Check if the element is found
          if (element) {
            // Once the element is found, update the step and scroll to the element
            setPointerPosition(getElementPosition(element));
            setElementToScroll(element);
            currentElementRef.current = element;

            // Function to mark the step as completed if the conditions are met
            const handleInteraction = () => {
              const isComplete = step?.isCompleteConditions?.(element) ?? true;

              debug &&
                console.log("Onborda: Step Interaction", step, isComplete);

              if (isComplete && !completedSteps.has(currentStep)) {
                debug &&
                  console.log("Onborda: Step Completed", currentStep, step);
                step?.onComplete && step.onComplete();
                setCompletedSteps(completedSteps.add(currentStep));
              } else if (!isComplete && completedSteps.has(currentStep)) {
                debug &&
                  console.log("Onborda: Step Incomplete", currentStep, step);
                setCompletedSteps((prev) => {
                  prev.delete(currentStep);
                  return prev;
                });
              }
            };

            // Initial check
            handleInteraction();

            // Enable pointer events on the element
            if (step.interactable) {
              // Current step should be interactable
              const htmlElement = element as HTMLElement;
              htmlElement.style.pointerEvents = "auto";

              // Check if the step has an observer selector, if not, use the focused element itself
              const eventListenerElements = step?.observerSelector
                ? document.querySelectorAll(step.observerSelector)
                : [element];
              const htmlElements = Array.from(
                eventListenerElements
              ) as HTMLElement[];

              //create observer to check if the element to focus has changed
              const observer = new MutationObserver((mutations, observer) => {
                debug &&
                  console.log(
                    "Onborda: Observer interaction Mutation",
                    mutations
                  );
                // If there are mutations, update the pointer position
                updatePointerPosition();
                // does this step have conditions to be met?
                if (step?.isCompleteConditions) {
                  handleInteraction();
                }
              });

              //add the observer to the elements
              htmlElements.forEach((el) => {
                debug && console.log("Onborda: Observer added to element", el);
                //add data attribute to the element
                el.setAttribute("data-onborda-observed", "true");
                //assign the observer to the element
                observer.observe(el, {
                  childList: true,
                  subtree: true,
                });
                //cleanup the observer
                cleanup.push(() => {
                  debug &&
                    console.log(
                      "Onborda: Observer disconnected from element",
                      el
                    );
                  el.removeAttribute("data-onborda-observed");
                  observer.disconnect();
                });
              });
            }
            elementFound = true;
          }
          // Even if the element is already found, we still need to check if the route is different from the current route
          // do we have a route to navigate to?
          if (step.route) {
            // Check if the route is set and different from the current route
            if (currentRoute == null || !currentRoute?.endsWith(step.route)) {
              debug && console.log("Onborda: Navigating to route", step.route);
              // Trigger the next route
              router.push(step.route);

              // Use MutationObserver to detect when the target element is available in the DOM
              const observer = new MutationObserver((mutations, observer) => {
                const shouldSelect = hasSelector(currentTourSteps[currentStep]);
                if (shouldSelect) {
                  const element = getStepSelectorElement(
                    currentTourSteps[currentStep]
                  );
                  if (element) {
                    // Once the element is found, update the step and scroll to the element
                    setPointerPosition(getElementPosition(element));
                    setElementToScroll(element);
                    currentElementRef.current = element;

                    // Enable pointer events on the element
                    if (step.interactable) {
                      const htmlElement = element as HTMLElement;
                      htmlElement.style.pointerEvents = "auto";
                    }

                    // Stop observing after the element is found
                    observer.disconnect();
                    debug &&
                      console.log(
                        "Onborda: Observer disconnected after element found",
                        element
                      );
                  } else {
                    debug &&
                      console.log(
                        "Onborda: Observing for element...",
                        currentTourSteps[currentStep]
                      );
                  }
                } else {
                  setCurrentStep(currentStep);
                  observer.disconnect();
                  debug &&
                    console.log(
                      "Onborda: Observer disconnected after no selector set",
                      currentTourSteps[currentStep]
                    );
                }
              });

              // Start observing the document body for changes
              observer.observe(document.body, {
                childList: true,
                subtree: true,
              });

              setPendingRouteChange(true);

              // Set a timeout to disconnect the observer if the element is not found within a certain period
              const timeoutId = setTimeout(() => {
                observer.disconnect();
                console.error(
                  "Onborda: Observer Timeout",
                  currentTourSteps[currentStep]
                );
              }, observerTimeout); // Adjust the timeout period as needed

              // Clear the timeout if the observer disconnects successfully
              const originalDisconnect = observer.disconnect.bind(observer);
              observer.disconnect = () => {
                setPendingRouteChange(false);
                clearTimeout(timeoutId);
                originalDisconnect();
              };
            }
          }
        } else {
          // no selector, but might still need to navigate to a route
          if (
            step.route &&
            (currentRoute == null || !currentRoute?.endsWith(step.route))
          ) {
            // Trigger the next route
            debug && console.log("Onborda: Navigating to route", step.route);
            router.push(step.route);
          } else if (!completedSteps.has(currentStep)) {
            // don't have a route to navigate to, but the step is not completed
            debug &&
              console.log(
                "Onborda: Step Completed via no selector",
                currentStep,
                step
              );
            step?.onComplete && step.onComplete();
            setCompletedSteps(completedSteps.add(currentStep));
          }
        }

        // No element set for this step? Place the pointer at the center of the screen
        if (!elementFound) {
          setPointerPosition({
            x: window.innerWidth / 2,
            y: window.innerHeight / 2,
            width: 0,
            height: 0,
          });
          setElementToScroll(null);
          currentElementRef.current = null;
        }

        // Prefetch the next route
        const nextStep = currentTourSteps[currentStep + 1];
        if (nextStep && nextStep?.route) {
          debug &&
            console.log("Onborda: Prefetching Next Route", nextStep.route);
          router.prefetch(nextStep.route);
        }
      }
    }
    return () => {
      // Disable pointer events on the element on cleanup
      if (currentElementRef.current) {
        const htmlElement = currentElementRef.current as HTMLElement;
        htmlElement.style.pointerEvents = "";
      }
      // Cleanup any event listeners we may have added
      cleanup.forEach((fn) => fn());
    };
  }, [
    currentTour, // Re-run the effect when the current tour changes
    currentStep, // Re-run the effect when the current step changes
    currentTourSteps, // Re-run the effect when the current tour steps change
    isOnbordaVisible, // Re-run the effect when the onborda visibility changes
    currentRoute, // Re-run the effect when the current route changes
    completedSteps, // Re-run the effect when the completed steps change
  ]);

  // - -
  // Helper function to get element position
  const getElementPosition = (element: Element) => {
    const { top, left, width, height } = element.getBoundingClientRect();
    const scrollTop = window.scrollY || document.documentElement.scrollTop;
    const scrollLeft = window.scrollX || document.documentElement.scrollLeft;
    return {
      x: left + scrollLeft,
      y: top + scrollTop,
      width,
      height,
    };
  };

  // - -
  // Scroll to the element when the elementToScroll changes
  useEffect(() => {
    if (elementToScroll && isOnbordaVisible) {
      debug && console.log("Onborda: Element to Scroll Changed");
      const rect = elementToScroll.getBoundingClientRect();
      const isAbove = rect.top < 0;
      elementToScroll.scrollIntoView({
        behavior: "smooth",
        block: isAbove ? "center" : "center",
        inline: "center",
      });
    }
  }, [elementToScroll, isOnbordaVisible]);

  // - -
  // Update pointer position on window resize
  const updatePointerPosition = () => {
    if (currentTourSteps) {
      const step = currentTourSteps[currentStep];
      if (step) {
        const element = getStepSelectorElement(step);
        if (element) {
          setPointerPosition(getElementPosition(element));
        } else {
          // if the element is not found, place the pointer at the center of the screen
          setPointerPosition({
            x: window.innerWidth / 2,
            y: window.innerHeight / 2,
            width: 0,
            height: 0,
          });
          setElementToScroll(null);
          currentElementRef.current = null;
        }
      }
    }
  };

  // - -
  // Update pointer position on window resize
  useEffect(() => {
    if (isOnbordaVisible) {
      window.addEventListener("resize", updatePointerPosition);
      window.addEventListener("scroll", updatePointerPosition);
      return () => {
        window.removeEventListener("resize", updatePointerPosition);
        window.removeEventListener("scroll", updatePointerPosition);
      };
    }
  }, [currentStep, currentTourSteps, isOnbordaVisible]);

  // - -
  // Step Controls
  const nextStep = async () => {
    const nextStepIndex = currentStep + 1;
    await setStep(nextStepIndex);
  };

  const prevStep = async () => {
    const prevStepIndex = currentStep - 1;
    await setStep(prevStepIndex);
  };

  const setStep = async (step: number | string) => {
    const setStepIndex =
      typeof step === "string"
        ? currentTourSteps.findIndex((s) => s?.id === step)
        : step;
    setCurrentStep(setStepIndex);
  };

  // - -
  // Card Arrow
  const CardArrow = ({ isVisible }: { isVisible: boolean }) => {
    if (!isVisible) {
      return null;
    }
    return (
      <svg
        viewBox="0 0 54 54"
        data-name="onborda-arrow"
        className={cn("absolute w-6 h-6 origin-center", classes?.arrow)}
        style={getArrowStyle(currentTourSteps?.[currentStep]?.side as any)}
      >
        <path id="triangle" d="M27 27L0 0V54L27 27Z" fill="currentColor" />
      </svg>
    );
  };

  // - -
  // Overlay Variants
  const variants = {
    visible: { opacity: 1 },
    hidden: { opacity: 0 },
  };

  // - -
  // Pointer Options
  const pointerPadding = currentTourSteps?.[currentStep]?.pointerPadding ?? 30;
  const pointerPadOffset = pointerPadding / 2;
  const pointerRadius = currentTourSteps?.[currentStep]?.pointerRadius ?? 28;
  const pointerEvents =
    pointerPosition && isOnbordaVisible ? "pointer-events-none" : "";

  return (
    <>
      {/* Container for the Website content */}
      <div
        data-name="onborda-site-wrapper"
        className={` ${pointerEvents} ${cn(classes?.siteWrapper)}`}
      >
        {children}
      </div>

      {/* Onborda Overlay Step Content */}
      {pointerPosition &&
        isOnbordaVisible &&
        CardComponent &&
        currentTourObject && (
          <Portal>
            <MotionConfig reducedMotion="user">
              <motion.div
                data-name="onborda-overlay"
                className={cn(
                  "absolute inset-0 pointer-events-none z-50",
                  classes?.overlay
                )}
                initial="hidden"
                animate={isOnbordaVisible ? "visible" : "hidden"}
                variants={variants}
                transition={{ duration: 0.5 }}
              >
                <motion.div
                  data-name="onborda-pointer"
                  className={cn("relative z-50", classes?.pointer)}
                  style={{
                    borderRadius: `${pointerRadius}px ${pointerRadius}px ${pointerRadius}px ${pointerRadius}px`,
                  }}
                  initial={
                    pointerPosition
                      ? {
                          x: pointerPosition.x - pointerPadOffset,
                          y: pointerPosition.y - pointerPadOffset,
                          width: pointerPosition.width + pointerPadding,
                          height: pointerPosition.height + pointerPadding,
                        }
                      : {}
                  }
                  animate={
                    pointerPosition
                      ? {
                          x: pointerPosition.x - pointerPadOffset,
                          y: pointerPosition.y - pointerPadOffset,
                          width: pointerPosition.width + pointerPadding,
                          height: pointerPosition.height + pointerPadding,
                        }
                      : {}
                  }
                  transition={cardTransition}
                >
                  {/* Card */}
                  <div
                    className={cn(
                      "absolute flex flex-col max-w-[100%] transition-all min-w-min pointer-events-auto z-50",
                      classes?.card
                    )}
                    data-name="onborda-card"
                    style={getCardStyle(
                      currentTourSteps?.[currentStep]?.side as any
                    )}
                  >
                    <CardComponent
                      step={currentTourSteps?.[currentStep]!}
                      tour={currentTourObject}
                      currentStep={currentStep}
                      totalSteps={currentTourSteps?.length ?? 0}
                      nextStep={nextStep}
                      prevStep={prevStep}
                      setStep={setStep}
                      closeOnborda={closeOnborda}
                      setOnbordaVisible={setOnbordaVisible}
                      arrow={
                        <CardArrow
                          isVisible={
                            currentTourSteps?.[currentStep]
                              ? hasSelector(currentTourSteps?.[currentStep])
                              : false
                          }
                        />
                      }
                      completedSteps={Array.from(completedSteps)}
                      pendingRouteChange={pendingRouteChange}
                    />
                  </div>
                </motion.div>
              </motion.div>
              {TourComponent && (
                <motion.div
                  data-name="onborda-tour-wrapper"
                  className={cn(
                    "fixed top-0 left-0 z-40 w-screen h-screen pointer-events-none",
                    classes?.tourWrapper
                  )}
                >
                  <motion.div
                    data-name="onborda-tour"
                    className={cn("pointer-events-auto", classes?.tour)}
                  >
                    <TourComponent
                      tour={currentTourObject}
                      currentTour={currentTour}
                      currentStep={currentStep}
                      setStep={setStep}
                      completedSteps={Array.from(completedSteps)}
                      closeOnborda={closeOnborda}
                    />
                  </motion.div>
                </motion.div>
              )}
            </MotionConfig>
          </Portal>
        )}
    </>
  );
};

export default Onborda;
