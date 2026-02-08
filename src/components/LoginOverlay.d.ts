import { FC } from 'react';

interface LoginOverlayProps {
  onSuccess?: (data: any) => void;
  defaultUsername?: string;
  title?: string;
}

declare const LoginOverlay: FC<LoginOverlayProps>;

export default LoginOverlay;
