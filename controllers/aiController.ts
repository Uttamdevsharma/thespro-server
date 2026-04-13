import asyncHandler from 'express-async-handler';
import axios from 'axios';

// @desc    Chat with AI using OpenRouter
// @route   POST /api/ai/chat
// @access  Private
export const chatWithAI = asyncHandler(async (req, res) => {
    const { message, chatHistory } = req.body;
    const apiKey = process.env.OPENROUTER_API_KEY;

    if (!apiKey) {
        console.error('CRITICAL: OPENROUTER_API_KEY is not defined in process.env');
        res.status(500);
        throw new Error('AI Service Configuration Error: API Key is missing. Please restart the server after adding the key to .env');
    }

    try {
        const response = await axios.post(
            'https://openrouter.ai/api/v1/chat/completions',
            {
                model: 'google/gemini-2.0-flash-001',
                messages: [
                    { 
                        role: 'system', 
                        content: 'You are an helpful academic assistant for ThesPro, a thesis management system. Assist students with thesis topics, proposal writing, and general academic guidance.' 
                    },
                    ...chatHistory,
                    { role: 'user', content: message }
                ],
            },
            {
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json',
                    'HTTP-Referer': 'http://localhost:3000', // Optional, for OpenRouter tracking
                    'X-Title': 'ThesPro AI Assistant', // Optional
                },
            }
        );

        const aiResponse = response.data.choices[0].message.content;
        res.json({ response: aiResponse });
    } catch (error: any) {
        console.error('OpenRouter Error:', error.response?.data || error.message);
        res.status(error.response?.status || 500);
        throw new Error(error.response?.data?.error?.message || 'AI service error. Please try again later.');
    }
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
