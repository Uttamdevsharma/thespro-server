import asyncHandler from 'express-async-handler';
import axios from 'axios';

const AI_TIMEOUT = 20000;

const CLIENT_URL = process.env.FRONTEND_URL || process.env.CLIENT_URL || 'http://localhost:3000';

// Model fallback list — tries each in order until one succeeds
// Updated July 2026 — verified free models on OpenRouter
const CHAT_MODELS = [
    'meta-llama/llama-3.3-70b-instruct:free',
    'nvidia/nemotron-3-super-120b-a12b:free',
    'meta-llama/llama-4-maverick:free',
];

const callOpenRouter = async (apiKey: string, model: string, messages: any[]) => {
    return axios.post(
        'https://openrouter.ai/api/v1/chat/completions',
        { model, messages },
        {
            timeout: AI_TIMEOUT,
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
                'HTTP-Referer': CLIENT_URL,
                'X-Title': 'ThesPro AI Assistant',
            },
        }
    );
};

// @desc    Chat with AI using OpenRouter
// @route   POST /api/ai/chat
// @access  Public
export const chatWithAI = asyncHandler(async (req, res) => {
    const { message, chatHistory } = req.body;
    const apiKey = process.env.OPENROUTER_API_KEY;

    if (!apiKey) {
        console.error('OPENROUTER_API_KEY is not defined');
        res.status(500);
        throw new Error('AI service is not configured. Please contact the administrator.');
    }

    if (!message || !message.trim()) {
        res.status(400);
        throw new Error('Message is required.');
    }

    const messages = [
        {
            role: 'system',
            content: 'You are a helpful academic assistant for ThesPro, a thesis management system. Assist students with thesis topics, proposal writing, and general academic guidance.'
        },
        ...(chatHistory || []),
        { role: 'user', content: message }
    ];

    let lastError: any = null;

    for (const model of CHAT_MODELS) {
        try {
            const response = await callOpenRouter(apiKey, model, messages);
            const aiResponse = response.data.choices[0].message.content;
            console.log(`[AI] Request handled by model: ${model}`);
            res.json({ response: aiResponse });
            return;
        } catch (error: any) {
            const status = error.response?.status;
            const errMsg = error.response?.data?.error?.message || '';

            if (error.code === 'ECONNABORTED') {
                console.warn(`Model ${model} timed out after ${AI_TIMEOUT / 1000}s, trying next...`);
                lastError = error;
                continue;
            }

            if (status === 404 || (status === 400 && (errMsg.includes('endpoint') || errMsg.includes('model')))) {
                console.warn(`Model ${model} unavailable, trying next...`);
                lastError = error;
                continue;
            }

            if (status === 429) {
                console.warn(`Rate limited on model ${model}, trying next...`);
                lastError = error;
                continue;
            }

            console.error(`OpenRouter Error [${model}]:`, error.response?.data || error.message);
            res.status(status || 503);
            throw new Error(errMsg || 'AI service error. Please try again later.');
        }
    }

    const fallbackMsg =
        lastError?.code === 'ECONNABORTED'
            ? 'The AI service is taking too long to respond. Please try again later.'
            : 'AI assistant is temporarily unavailable. Please try again later.';

    console.error('All AI models exhausted:', lastError?.response?.data || lastError?.message);
    res.status(503);
    throw new Error(fallbackMsg);
});

// @desc    Generate proposal description from title
// @route   POST /api/ai/generate-description
// @access  Private
export const generateProposalDescription = asyncHandler(async (req, res) => {
    const { title } = req.body;
    const apiKey = process.env.OPENROUTER_API_KEY;

    if (!apiKey) {
        res.status(500);
        throw new Error('AI service is not configured. Please contact the administrator.');
    }

    if (!title || !title.trim()) {
        res.status(400);
        throw new Error('Title is required.');
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
                timeout: AI_TIMEOUT,
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json',
                    'HTTP-Referer': CLIENT_URL,
                    'X-Title': 'ThesPro AI Assistant',
                },
            }
        );

        const description = response.data.choices[0].message.content;
        res.json({ description });
    } catch (error: any) {
        const status = error.response?.status;
        const errMsg = error.response?.data?.error?.message || '';

        if (error.code === 'ECONNABORTED') {
            res.status(504);
            throw new Error('AI service request timed out. Please try again.');
        }

        console.error('OpenRouter Error:', error.response?.data || error.message);
        res.status(status || 503);
        throw new Error(errMsg || 'Failed to generate description with AI. Please try again.');
    }
});
