/*
 * Orange angular-swagger-ui - v0.5.0
 *
 * (C) 2015 Orange, all right reserved
 * MIT Licensed
 */
'use strict';

angular
	.module('swaggerUi')
	.service('openApi3Converter', function($q, $http, swaggerModules, swaggerModel) {

		var HTTP_METHODS = ['get', 'put', 'post', 'delete', 'options', 'head', 'patch', 'trace'],
			SCHEMA_PROPERTIES = ['format', 'minimum', 'maximum', 'exclusiveMinimum', 'exclusiveMaximum', 'minLength', 'maxLength', 'multipleOf', 'minItems', 'maxItems', 'uniqueItems', 'minProperties', 'maxProperties', 'additionalProperties', 'pattern', 'enum', 'default'],
			ARRAY_PROPERTIES = ['type', 'items'];

		/**
		 * Module entry point
		 */
		this.execute = function(data) {
			var deferred = $q.defer(),
				version = data.openApiSpec && data.openApiSpec.openapi;

			if (version === '3.0.0' && (data.parser === 'json' || (data.parser === 'auto' && data.contentType === 'application/json'))) {
				convert(deferred, data);
			} else {
				deferred.resolve(false);
			}
			return deferred.promise;
		};

		/**
		 * Transforms OpenApi 3.0 to Swagger 2
		 */
		function convert(deferred, data) {
			// prepare openApiSpec objects
			data.openApiSpec.swagger = '2.0';
			convertInfos(data.openApiSpec);
			convertOperations(data.openApiSpec);
			convertSecurityDefinitions(data.openApiSpec);
			deferred.resolve(true);
		}

		/**
		 * convert main infos and tags
		 */
		function convertInfos(openApiSpec) {
			var a, server = openApiSpec.servers && openApiSpec.servers[0];
			if (server) {
				a = angular.element('<a href="' + server.url + '"></a>')[0];
				openApiSpec.schemes = [a.protocol.replace(':', '')];
				openApiSpec.host = a.host;
				openApiSpec.basePath = a.pathname;
			}
			delete openApiSpec.servers;
			delete openApiSpec.openapi;
		}

		function convertOperations(openApiSpec) {
			var path, pathObject, method, operation;
			for (path in openApiSpec.paths) {
				pathObject = openApiSpec.paths[path] = swaggerModel.resolveReference(openApiSpec, openApiSpec.paths[path]);
				for (method in pathObject) {
					if (HTTP_METHODS.indexOf(method) >= 0) {
						operation = pathObject[method] = swaggerModel.resolveReference(openApiSpec, pathObject[method]);
						convertParameters(openApiSpec, operation);
						convertResponses(openApiSpec, operation);
					}
				}
			}
		}

		function convertParameters(openApiSpec, operation) {
			var content, param;
			operation.parameters = operation.parameters || [];
			if (operation.requestBody) {
				param = operation.requestBody;
				param.name = 'body';
				content = swaggerModel.resolveReference(openApiSpec, operation.requestBody).content;
				if (content) {
					delete param.content;
					if (content['application/x-www-form-urlencoded']) {
						param.in = 'body';
						param.schema = content['application/x-www-form-urlencoded'].schema;
					} else if (content['multipart/form-data']) {
						param.in = 'formData';
						param.schema = content['application/x-www-form-urlencoded'].schema;
					} else if (content['application/octet-stream']) {
						param.in = 'file';
						param.schema = content['application/octet-stream'].schema;
					} else if (content['application/json']) {
						param.in = 'body';
						param.schema = content['application/json'].schema;
					} else {
						param = null;
						console.warn('unsupported request body media type', operation.operationId, content);
					}
					if (param) {
						operation.parameters.push(param);
					}
				}
				delete operation.requestBody;
			}
			angular.forEach(operation.parameters, function(param, i) {
				param = operation.parameters[i] = swaggerModel.resolveReference(openApiSpec, param);
				copySchemaProperties(param);
				copyArrayProperties(param);
				if (!param.schema.$ref) {
					delete param.schema;
				}
			});
		}

		function copySchemaProperties(obj) {
			angular.forEach(SCHEMA_PROPERTIES, function(prop) {
				if (obj.schema && obj.schema[prop]) {
					obj[prop] = obj.schema[prop];
					delete obj.schema[prop];
				}
			});
		}

		function copyArrayProperties(obj) {
			angular.forEach(ARRAY_PROPERTIES, function(prop) {
				if (obj.schema && obj.schema[prop]) {
					obj[prop] = obj.schema[prop];
					delete obj.schema[prop];
				}
			});
		}

		function convertResponses(openApiSpec, operation) {
			var code, content, contentType, response, resolved;
			for (code in operation.responses) {
				content = false;
				contentType = 'application/json';
				response = operation.responses[code] = swaggerModel.resolveReference(openApiSpec, operation.responses[code]);
				if (response.content) {
					if (response.content[contentType]) {
						content = response.content[contentType];
					}
					if (!content) {
						contentType = Object.keys(response.content)[0];
						content = response.content[contentType];
					}
				}
				if (content) {
					response.schema = content.schema;
					resolved = swaggerModel.resolveReference(openApiSpec, response.schema);
					if (resolved.type === 'array') {
						response.schema = resolved;
					}
					if (content.example) {
						response.examples = {};
						response.examples[contentType] = content.example;
					}
					copySchemaProperties(response);
				}
				delete response.content;
			}
		}

		function convertSecurityDefinitions(openApiSpec) {
			openApiSpec.securityDefinitions = openApiSpec.components.securitySchemes;
			angular.forEach(openApiSpec.securityDefinitions, function(security) {
				if (security.type === 'http' && security.scheme === 'basic') {
					security.type = 'basic';
				} else if (security.type === 'oauth2') {
					var flowName = Object.keys(security.flows)[0],
						flow = security.flows[flowName];

					if (flowName === 'clientCredentials') {
						security.flow = 'application';
					} else if (flowName === 'authorizationCode') {
						security.flow = 'accessCode';
					} else {
						security.flow = flowName;
					}
					security.authorizationUrl = flow.authorizationUrl;
					security.tokenUrl = flow.tokenUrl;
					security.scopes = flow.scopes;
					delete security.flows;
				}
			});
			delete openApiSpec.components.securitySchemes;
		}

	})
	.run(function(swaggerModules, openApi3Converter) {
		swaggerModules.add(swaggerModules.BEFORE_PARSE, openApi3Converter, 10);
	});