import asyncHandler from 'express-async-handler';
import axios from 'axios';

// Model fallback list — tries each in order until one succeeds
const CHAT_MODELS = [
    'google/gemini-2.0-flash-001',
    'google/gemini-flash-1.5',
    'meta-llama/llama-3.1-8b-instruct:free',
];

const callOpenRouter = async (apiKey: string, model: string, messages: any[]) => {
    return axios.post(
        'https://openrouter.ai/api/v1/chat/completions',
        { model, messages },
        {
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
                'HTTP-Referer': process.env.CLIENT_URL || 'http://localhost:3000',
                'X-Title': 'ThesPro AI Assistant',
            },
        }
    );
};

// @desc    Chat with AI using OpenRouter
// @route   POST /api/ai/chat
// @access  Private
export const chatWithAI = asyncHandler(async (req, res) => {
    const { message, chatHistory } = req.body;
    const apiKey = process.env.OPENROUTER_API_KEY;

    if (!apiKey) {
        console.error('CRITICAL: OPENROUTER_API_KEY is not defined in process.env');
        res.status(500);
        throw new Error('AI Service Configuration Error: API Key is missing.');
    }

    const messages = [
        { 
            role: 'system', 
            content: 'You are a helpful academic assistant for ThesPro, a thesis management system. Assist students with thesis topics, proposal writing, and general academic guidance.' 
        },
        ...chatHistory,
        { role: 'user', content: message }
    ];

    let lastError: any = null;

    for (const model of CHAT_MODELS) {
        try {
            const response = await callOpenRouter(apiKey, model, messages);
            const aiResponse = response.data.choices[0].message.content;
            res.json({ response: aiResponse });
            return;
        } catch (error: any) {
            const status = error.response?.status;
            const errMsg = error.response?.data?.error?.message || '';
            // Only try fallback on model-related errors (404, 400 with endpoint/model msg)
            if (status === 404 || (status === 400 && (errMsg.includes('endpoint') || errMsg.includes('model')))) {
                console.warn(`Model ${model} unavailable, trying next...`);
                lastError = error;
                continue;
            }
            // For other errors (auth, rate limit, network), fail immediately
            console.error('OpenRouter Error:', error.response?.data || error.message);
            res.status(status || 500);
            throw new Error(errMsg || 'AI service error. Please try again later.');
        }
    }

    // All models failed
    console.error('All AI models exhausted:', lastError?.response?.data || lastError?.message);
    res.status(503);
    throw new Error('AI assistant is temporarily unavailable. Please try again later.');
});

// @desc    Generate proposal description from title
// @route   POST /api/ai/generate-description
// @access  Private
export const generateProposalDescription = asyncHandler(async (req, res) => {
    const { title } = req.body;
    const apiKey = process.env.OPENROUTER_API_KEY;

    if (!apiKey) {
        res.status(500);
        throw new Error('OpenRouter API Key is missing in server environment.');
    }

    try {
        const response = await axios.post(
            'https://openrouter.ai/api/v1/chat/completions',
            {
                model: 'google/gemini-2.0-flash-001',
                messages: [
                    { 
                        role: 'system', 
                        content: 'You are an academic writing expert. Given a thesis or project title, generate a professional, concise, and engaging abstract/description (approximately 100-150 words). Focus on the core objectives and potential impact.' 
                    },
                    { role: 'user', content: `Generate a proposal description for the title: "${title}"` }
                ],
            },
            {
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json',
                },
            }
        );

        const description = response.data.choices[0].message.content;
        res.json({ description });
    } catch (error: any) {
        console.error('OpenRouter Error:', error.response?.data || error.message);
        res.status(error.response?.status || 500);
        throw new Error(error.response?.data?.error?.message || 'Failed to generate description with AI.');
    }
});
