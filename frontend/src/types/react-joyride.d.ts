declare module 'react-joyride' {
  import type { ComponentType, CSSProperties, ReactNode } from 'react';

  export type Step = {
    target: string;
    content: ReactNode;
    disableBeacon?: boolean;
    placement?: string;
    spotlightClicks?: boolean;
  };

  export type CallBackProps = {
    status?: string;
  };

  export const STATUS: {
    FINISHED: string;
    SKIPPED: string;
  };

  export type Styles = {
    options?: {
      primaryColor?: string;
      zIndex?: number;
    };
    tooltip?: CSSProperties;
    buttonNext?: CSSProperties;
    buttonBack?: CSSProperties;
    buttonClose?: CSSProperties;
  };

  export type Props = {
    steps: Step[];
    run?: boolean;
    continuous?: boolean;
    showSkipButton?: boolean;
    showProgress?: boolean;
    callback?: (data: CallBackProps) => void;
    styles?: Styles;
  };

  const Joyride: ComponentType<Props>;
  export default Joyride;
}

