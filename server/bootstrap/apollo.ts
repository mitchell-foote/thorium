
import express from "express";
import https from "https";
import http from "http";
import path from "path";
import fs from "fs";
import ipAddress from "../helpers/ipaddress";
import {typeDefs, resolvers} from "../data";
import chalk from "chalk";
import url from "url";
import {paths} from "../helpers/paths";
// Load some other stuff
import "../events/index";
import "../processes/index";
import {GraphQLField} from "graphql";
import {getArgumentValues} from "graphql";
import {vanity} from "./vanity";
import Websocket from 'ws';
import { useServer } from 'graphql-ws/lib/use/ws';
import { ApolloServer } from "@apollo/server";
import { ApolloServerPluginDrainHttpServer } from '@apollo/server/plugin/drainHttpServer';
import { expressMiddleware } from "@apollo/server/express4";
import { makeExecutableSchema } from "@graphql-tools/schema";
import App from "../app";


export const schema = makeExecutableSchema({
  typeDefs,
  resolvers,
  resolverValidationOptions: {
    requireResolversForResolveType: "ignore",
  },
});
// if (process.env.NODE_ENV === "development" && !process.env.CI) {
//   // Automatically generate the GraphQL schema and write it to file
//   // but only in development.
//   const schemaOutput = printSchema(schema);

//   fs.writeFileSync("./src/schema.graphql", schemaOutput);
// }

function getMutationName(opString: string) {
  const mutationMatch = opString.match(/mutation\s*(?:(\w*|\s*|\,*|\[*|\]*|\!*|\$*|\:*|\(*|\)*))*\s*{[\s\n]*([a-zA-Z_][a-zA-Z0-9_:]*)/);
  let operationName = null;
  if (mutationMatch && mutationMatch[2]) {
    operationName = mutationMatch[2].trim();
  }

  return {
    operationName,
  };
}

// TODO: Change app to the express type
function responseForOperation(requestContext) {
  // This plugin checks to see if a request
  // coming in is a mutation. If it is, it
  // hijacks the request and triggers the
  // event handler for that request in
  // /server/events. If the event handler doesn't
  // resolve (by calling the callback function cb)
  // in 500 milliseconds, it just returns.
  const {
    context,
    request,
    operation,
    operationName,
    contextValue
  } = requestContext;
  if(operation.operation === "subscription") {
    console.log("Subscription request", request);
  }
  if (operation.operation !== "mutation") {
    return null
  };
  if (request.operationName && schema.getMutationType()) {
    const mutationFields = schema.getMutationType()?.getFields();
    const {operationName} = getMutationName(request.query);
    // Check if the operation exists in the mutation type
    if (mutationFields && mutationFields[operationName]) {
      const mutationField = mutationFields[operationName];
      const args = request.variables;

      // // Use getArgumentValues to extract the argument values for the mutation
      // const argumentValues = getArgumentValues(
      //   mutationField as GraphQLField<any, any>,
      //   request.variables,
      // );

      // Figure out the context of the action
      const clientId = contextValue?.clientId;
      const client = App.clients.find(c => c.id === clientId);
      // Handle any triggers before the event so we can capture data that
      // the event might remove
      const flight = App.flights.find(
        f =>
          f.id === (client && client.flightId) ||
          (args.simulatorId && f.simulators.includes(args.simulatorId)),
      );
      const simulator = App.simulators.find(
        s =>
          s.id === (client && client.simulatorId) ||
          (args.simulatorId && s.id === args.simulatorId),
      );
      requestContext.context = {
        ...contextValue,
        flight: flight || contextValue?.flight || context?.flight,
        simulator: simulator || contextValue?.simulator || context?.simulator,
        client,
        isMutation: true,
      };
      // If there is a direct mutation resolver, execute that.
      // This is now the preferred way to execute mutations
      if (resolvers.Mutation[operationName]) {
        // The whole point of this is so we can still
        // trigger handle event, so lets do that.
        App.handleEvent(
          {
            ...args,
            cb: () => {},
          },
          operationName,
          requestContext.context,
        );
        // Returning null means it executes
        // the built-in mutation resolver
        return null;
      }
      return new Promise<any>(resolve => {
        // Execute the old legacy event handler system.
        let timeout = null;
        App.handleEvent(
          {
            ...args,
            cb: (a: any) => {
              console.log("Legacy event handler resolved", a);
              clearTimeout(timeout);
              
              resolve({data: {[operationName]: a}});
            },
          },
          operationName,
          requestContext.context,
        );
        timeout = setTimeout(() => { resolve({ error: "fail", data: {} }) }, 2000);
        //resolve({ data: {}, status: 200 });
    });
  }
}
  // const selection = operation.selectionSet.selections[0] as FieldNode;
  // const opName = selection.name.value;
  // const parentType = getOperationRootType(schema, operation);
  // const fieldDef = getFieldDef(schema, parentType, opName);
  // const args = getArgumentValues(
  //   fieldDef,
  //   operation.selectionSet.selections[0] as FieldNode,
  //   variables,
  // );

  // // Figure out the context of the action
  // const {clientId} = context;
  // const client = App.clients.find(c => c.id === clientId);
  // // Handle any triggers before the event so we can capture data that
  // // the event might remove
  // const flight = App.flights.find(
  //   f =>
  //     f.id === (client && client.flightId) ||
  //     (args.simulatorId && f.simulators.includes(args.simulatorId)),
  // );
  // const simulator = App.simulators.find(
  //   s =>
  //     s.id === (client && client.simulatorId) ||
  //     (args.simulatorId && s.id === args.simulatorId),
  // );
  // // We really want to modify this read-only property
  // // @ts-ignore ts(2540)
  // requestContext.context = {
  //   ...context,
  //   flight: flight || context.flight,
  //   simulator: simulator || context.simulator,
  //   client,
  //   isMutation: true,
  // };

  // // If there is a direct mutation resolver, execute that.
  // // This is now the preferred way to execute mutations
  // if (resolvers.Mutation[opName]) {
  //   // The whole point of this is so we can still
  //   // trigger handle event, so lets do that.
  //   App.handleEvent(
  //     {
  //       ...args,
  //       cb: () => {},
  //     },
  //     opName,
  //     requestContext.context,
  //   );
  //   // Returning null means it executes
  //   // the built-in mutation resolver
  //   return null;
  // }
  
  return null;
}
export const apolloStartup = async (
  app: express.Application,
  SERVER_PORT: number,
  httpOnly: boolean,
  setMutations: (r: {[key: string]: Function}) => void,
) => {
  // Apply the mutations to App.js so we don't get circular dependency issues
  setMutations(resolvers.Mutation);

  let httpServer: http.Server | https.Server = http.createServer(app);

  const wsServer = new Websocket.Server({
    path: '/graphql',
    server: httpServer,
  });

  const serverCleanup = useServer({ schema, 
    context: async (ctx, msg, args) => {
      return { clientId: ctx.connectionParams.clientId, core: ctx.connectionParams.core }
  } }, wsServer);

  const apollo = new ApolloServer({
    schema, 
    introspection: true,
    plugins: [
      ApolloServerPluginDrainHttpServer({ httpServer }),
      {
      async requestDidStart() {
        return {
          responseForOperation,
        };
      },
    },
    {
      async serverWillStart() {
        return {
          async drainServer() {
            await serverCleanup.dispose();
          },
        };
      },
    }
    ],
  });

  await apollo.start();
  app.use("/graphql", expressMiddleware(apollo, {
    context: async (variable) => {
      return {
        clientId: variable.req?.headers.clientid,
        core: variable.req?.headers.core,
      }
    }
  }));

  let isHttps = false;
  if (process.env.NODE_ENV === "production" && !httpOnly) {
    isHttps = true;

    // Be sure to default back to the built-in cert if the
    // actual cert doesn't exist
    let key, cert;
    if (fs.existsSync(`${paths.userData}/server.key`)) {
      key = fs.readFileSync(`${paths.userData}/server.key`, "utf8");
      cert = fs.readFileSync(`${paths.userData}/server.cert`, "utf8");
    } else {
      key = fs.readFileSync(path.resolve(`${__dirname}/../server.key`), "utf8");
      cert = fs.readFileSync(
        path.resolve(`${__dirname}/../server.cert`),
        "utf8",
      );
    }
    httpServer = https.createServer({key, cert}, app);

    // If the port is 443, start a server at 80 to redirect to 443
    if (SERVER_PORT === 443) {
      const insecureServer = http.createServer((req, res) => {
        const pathParts = url.parse(req.url);

        res.writeHead(302, {
          Location: `https://${req.headers.host}${pathParts.path}`,
        });
        res.end();
      });
      insecureServer.listen(80);
    }
  }

  vanity();

  function printUrl({isWs = false} = {}) {
    return `${isWs ? "ws" : "http"}${isHttps ? "s" : ""}://${ipAddress}${
      (SERVER_PORT === 443 && isHttps) || (SERVER_PORT === 80 && !isHttps)
        ? ""
        : `:${SERVER_PORT}`
    }`;
  }

  const serverMessage = `
Client Server running on ${printUrl()}/client
Access the Flight Director on ${printUrl()}
GraphQL Server running on ${printUrl()}/graphql
🚀 Subscriptions ready at ${printUrl({isWs: true})}/graphql`;

  process.on("uncaughtException", function (err) {
    // String key because typescript is funky
    if (err["code"] === "EADDRINUSE") {
      console.error(
        chalk.redBright(
          "There is already a version of Thorium running on this computer. Changing port to 4444",
        ),
      );
      // Fallover to 4444 if someone is already using the specified ports on this computer
      httpServer.listen(4444, () => {
        console.info(serverMessage);
      });
    }
  });
  try {
    httpServer.listen(SERVER_PORT, () => {
      console.info(serverMessage);
    });
  } catch (err) {
    console.error("That didnt work...", err);
  }
};
