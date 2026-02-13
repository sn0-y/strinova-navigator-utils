import { Route } from '@sapphire/plugin-api';

export class StatusRoute extends Route {
  public run(_request: Route.Request, response: Route.Response) {
    const ping = this.container.client.ws.ping;
    
    response.ok({ ping });
  }
}