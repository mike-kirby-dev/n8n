import {
	IExecuteFunctions,
} from 'n8n-core';

import {
	IDataObject,
	ILoadOptionsFunctions,
	INodeExecutionData,
	INodePropertyOptions,
	INodeType,
	INodeTypeDescription,
	IPairedItemData,
} from 'n8n-workflow';

import {
	deepLApiRequest,
} from './GenericFunctions';

import {
	textOperations
} from './TextDescription';

export class DeepL implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'DeepL',
		name: 'deepL',
		icon: 'file:deepl.svg',
		group: ['input', 'output'],
		version: 1,
		description: 'Translate data using DeepL',
		subtitle: '={{$parameter["operation"] + ": " + $parameter["resource"]}}',
		defaults: {
			name: 'DeepL',
		},
		inputs: ['main'],
		outputs: ['main'],
		credentials: [
			{
				name: 'deepLApi',
				required: true,
			},
		],
		properties: [
			{
				displayName: 'Resource',
				name: 'resource',
				type: 'options',
				noDataExpression: true,
				options: [
					{
						name: 'Language',
						value: 'language',
					},
				],
				default: 'language',
			},
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: {
					show: {
						resource: [
							'language',
						],
					},
				},
				options: [
					{
						name: 'Translate',
						value: 'translate',
						description: 'Translate data',
					},
				],
				default: 'translate',
			},
			...textOperations,
		],
	};

	methods = {
		loadOptions: {
			async getLanguages(this: ILoadOptionsFunctions) {
				const returnData: INodePropertyOptions[] = [];
				const languages = await deepLApiRequest.call(this, 'GET', '/languages', {}, { type: 'target' });
				for (const language of languages) {
					returnData.push({
						name: language.name,
						value: language.language,
					});
				}

				returnData.sort((a, b) => {
					if (a.name < b.name) { return -1; }
					if (a.name > b.name) { return 1; }
					return 0;
				});

				return returnData;
			},
		},
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const length = items.length;

		const responseData:INodeExecutionData[] = [];

		for (let i = 0; i < length; i++) {
			try {
				const resource = this.getNodeParameter('resource', i) as string;
				const operation = this.getNodeParameter('operation', i) as string;
				const additionalFields = this.getNodeParameter('additionalFields', i) as IDataObject;

				const resourceOperationKey = `${resource}.${operation}`;
				const handler = handlerMapping.get(resourceOperationKey);
				if(handler) {
					const data = await handler(this, i, additionalFields);
					responseData.push(data);
				}
			} catch (error) {
				if (this.continueOnFail()) {
					responseData.push({
						$error: error,
						$json: {...this.getInputData(i)},
						json: {...this.getInputData(i)},
						pairedItem: {
							item: i,
						}
					});
					continue;
				}
				throw error;
			}
		}

		return [responseData];
	}
}

type LanguageTranslationHandler = (context: IExecuteFunctions, i: number, additionalFields: IDataObject) => Promise<INodeExecutionData>;

enum Resource {
	Language = 'language'
};

enum Operation {
	Translate = 'translate'
}

const handlerMapping = new Map<string, LanguageTranslationHandler>([
	[
		`${Resource.Language}.${Operation.Translate}`,
		async (context: IExecuteFunctions, i: number, additionalFields: IDataObject): Promise<INodeExecutionData> => {
				const text = context.getNodeParameter('text', i) as string;
				const translateTo = context.getNodeParameter('translateTo', i) as string;
				const qs = { target_lang: translateTo, text } as IDataObject;

				if (additionalFields.sourceLang !== undefined) {
					qs.source_lang = ['EN-GB', 'EN-US'].includes(additionalFields.sourceLang as string)
						? 'EN'
						: additionalFields.sourceLang;
				}

				const response = await deepLApiRequest.call(context, 'GET', '/translate', {}, qs);
				const json = (response.translations as Array<object>).shift() as IDataObject;
				const pairedItem = { item: i } as IPairedItemData;
				return { json, pairedItem };
		}
	]
]);
