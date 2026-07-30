import "./index.css";
import { Composition, Folder } from "remotion";
import { ensureFontsLoaded } from "./fonts";
import { ConferenceVideo, SCENE_LEN, TOTAL_FRAMES } from "./Video";
import { Scene1Hero } from "./scenes/Scene1Hero";
import { Scene2Ledger } from "./scenes/Scene2Ledger";
import { Scene3ProductMockup } from "./scenes/Scene3ProductMockup";
import { Scene4Dashboard } from "./scenes/Scene4Dashboard";
import { Scene5Stepper } from "./scenes/Scene5Stepper";
import { Scene6WhatsApp } from "./scenes/Scene6WhatsApp";
import { Scene7Closing } from "./scenes/Scene7Closing";

ensureFontsLoaded();

const WIDTH = 1920;
const HEIGHT = 1080;
const FPS = 30;

const sceneComponents = [
  { id: "Scene1-Hero", component: Scene1Hero },
  { id: "Scene2-Ledger", component: Scene2Ledger },
  { id: "Scene3-ProductMockup", component: Scene3ProductMockup },
  { id: "Scene4-Dashboard", component: Scene4Dashboard },
  { id: "Scene5-Stepper", component: Scene5Stepper },
  { id: "Scene6-WhatsApp", component: Scene6WhatsApp },
  { id: "Scene7-Closing", component: Scene7Closing },
];

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Folder name="FastBuildings-Scenes">
        {sceneComponents.map(({ id, component }) => (
          <Composition
            key={id}
            id={id}
            component={component}
            durationInFrames={SCENE_LEN}
            fps={FPS}
            width={WIDTH}
            height={HEIGHT}
          />
        ))}
      </Folder>
      <Composition
        id="FastBuildings-ConferenceVideo"
        component={ConferenceVideo}
        durationInFrames={TOTAL_FRAMES}
        fps={FPS}
        width={WIDTH}
        height={HEIGHT}
      />
    </>
  );
};
