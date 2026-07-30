import React from "react";
import { TransitionSeries, linearTiming } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { Scene1Hero } from "./scenes/Scene1Hero";
import { Scene2Ledger } from "./scenes/Scene2Ledger";
import { Scene3ProductMockup } from "./scenes/Scene3ProductMockup";
import { Scene4Dashboard } from "./scenes/Scene4Dashboard";
import { Scene5Stepper } from "./scenes/Scene5Stepper";
import { Scene6WhatsApp } from "./scenes/Scene6WhatsApp";
import { Scene7Closing } from "./scenes/Scene7Closing";

export const SCENE_LEN = 180;
export const FADE = 20;
export const SCENE_COUNT = 7;
export const TOTAL_FRAMES = SCENE_LEN * SCENE_COUNT - FADE * (SCENE_COUNT - 1);

const scenes = [
  Scene1Hero,
  Scene2Ledger,
  Scene3ProductMockup,
  Scene4Dashboard,
  Scene5Stepper,
  Scene6WhatsApp,
  Scene7Closing,
];

export const ConferenceVideo: React.FC = () => {
  return (
    <TransitionSeries>
      {scenes.map((Scene, i) => (
        <React.Fragment key={Scene.displayName ?? i}>
          <TransitionSeries.Sequence durationInFrames={SCENE_LEN} name={`Scene${i + 1}`}>
            <Scene />
          </TransitionSeries.Sequence>
          {i < scenes.length - 1 && (
            <TransitionSeries.Transition
              presentation={fade()}
              timing={linearTiming({ durationInFrames: FADE })}
            />
          )}
        </React.Fragment>
      ))}
    </TransitionSeries>
  );
};
