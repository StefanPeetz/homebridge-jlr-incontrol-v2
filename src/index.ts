import { API } from 'homebridge';
import { JlrSmartcarPlatform } from './platform';

export = (api: API): void => {
  api.registerPlatform('JlrSmartcarPlatform', JlrSmartcarPlatform);
};
