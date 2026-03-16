import prisma from '../lib/prisma.js';
import openai from '../configs/openai.js';
// Get user credits 
export const getUserCredits = async (req, res) => {
    try {
        const userId = req.userId;
        if (!userId) {
            return res.status(401).json({ message: "Unauthorized user" });
        }
        const user = await prisma.user.findUnique({
            where: { id: userId }
        });
        res.json({ credits: user?.credits });
    }
    catch (error) {
        console.log(error.code || error.message);
        res.status(500).json({ message: error.message });
    }
};
// to create a new project
export const createUserProject = async (req, res) => {
    const userId = req.userId;
    try {
        const { initial_prompt } = req.body;
        if (!userId) {
            return res.status(401).json({ message: "Unauthorized user" });
        }
        const user = await prisma.user.findUnique({
            where: { id: userId }
        });
        if (user && user.credits < 5) {
            return res.status(403).json({ message: "Insufficient credits to create projects" });
        }
        //create a new project 
        const project = await prisma.websiteProject.create({
            data: {
                name: initial_prompt.length > 50 ? initial_prompt.substring(0, 47) + "..." : initial_prompt,
                initial_prompt,
                userId
            }
        });
        //update user credits
        await prisma.user.update({
            where: { id: userId },
            data: { totalCreation: { increment: 1 } }
        });
        await prisma.conversation.create({
            data: {
                role: 'user',
                content: initial_prompt,
                projectId: project.id
            }
        });
        await prisma.user.update({
            where: { id: userId },
            data: { credits: { decrement: 5 } }
        });
        res.json({ projectId: project.id });
        // enchnace user prompt 
        const promptEnchanceResponse = await openai.chat.completions.create({
            model: "z-ai/glm-4.5-air:free",
            messages: [
                {
                    role: "system",
                    content: `
                    You are a prompt enhancement specialist. Take the user's website request and expand it into a detailed, comprehensive prompt that will help create the best possible website.

                    Enhance this prompt by:
                    1. Adding specific design details (layout, color scheme, typography)
                    2. Specifying key sections and features
                    3. Describing the user experience and interactions
                    4. Including modern web design best practices
                    5. Mentioning responsive design requirements
                    6. Adding any missing but important elements

                    Return ONLY the enhanced prompt, nothing else. Make it detailed but concise (2-3 paragraphs max).etter. 
                    `
                },
                {
                    role: 'user',
                    content: initial_prompt
                }
            ]
        });
        const enhancedPrompt = promptEnchanceResponse.choices[0].message.content;
        await prisma.conversation.create({
            data: {
                role: 'assistant',
                content: `Enhanced Prompt: ${enhancedPrompt}`,
                projectId: project.id
            }
        });
        await prisma.conversation.create({
            data: {
                role: 'assistant',
                content: `now generating your website...`,
                projectId: project.id
            }
        });
        //generate website code 
        const codeGenerationResponse = await openai.chat.completions.create({
            model: "z-ai/glm-4.5-air:free",
            messages: [
                {
                    role: "system",
                    content: `
                    You are a website generation specialist. Take the user's website request and generate a complete, production-ready website codebase.

                    Generate the following files:
                    1. index.html - Main landing page
                    2. style.css - Styling and design
                    3. script.js - Interactivity and features
                    4. README.md - Project overview and instructions

                    Requirements:
                    - Use modern HTML5, CSS3, and vanilla JavaScript
                    - Design must match the user's request
                    - Include all key sections and features
                    - Implement responsive design for mobile, tablet, and desktop
                    - Use clean, well-organized code
                    - Add comments to explain complex sections
                    - Provide a README with setup and usage instructions

                    Return ONLY the code for each file, clearly labeled.
                    `
                },
                {
                    role: 'user',
                    content: enhancedPrompt || ''
                }
            ]
        });
        const code = codeGenerationResponse.choices[0].message.content || '';
        // create version for the project
        const version = await prisma.version.create({
            data: {
                code: code.replace(/```[a-z]*\n?/, '').replace(/```/, '')
                    .trim(),
                description: 'Initial version',
                projectId: project.id
            }
        });
        await prisma.conversation.create({
            data: {
                role: 'assistant',
                content: "I have created your website! You can now preview it and request for changes",
                projectId: project.id
            }
        });
        await prisma.websiteProject.update({
            where: { id: project.id },
            data: {
                current_code: code.replace(/```[a-z]*\n?/, '').replace(/```/, '')
                    .trim(),
                current_version_index: version.id
            }
        });
    }
    catch (error) {
        await prisma.user.update({
            where: { id: userId },
            data: { credits: { increment: 5 } }
        });
        console.log(error);
        res.status(500).json({ message: error.message });
    }
};
// controller to get singel user project
export const getUserProject = async (req, res) => {
    try {
        const userId = req.userId;
        if (!userId) {
            return res.status(401).json({ message: "Unauthorized user" });
        }
        const { projectId } = req.params;
        const project = await prisma.websiteProject.findFirst({
            where: { id: projectId, userId: userId },
            include: {
                conversation: {
                    orderBy: { timestamp: 'asc' }
                },
                versions: { orderBy: { timestamp: 'asc' } }
            }
        });
        res.json(project);
    }
    catch (error) {
        console.log(error);
        res.status(500).json({ message: error.message });
    }
};
// controller to get all user projects
export const getUserProjects = async (req, res) => {
    try {
        const userId = req.userId;
        if (!userId) {
            return res.status(401).json({ message: "Unauthorized user" });
        }
        const projects = await prisma.websiteProject.findMany({
            where: { userId },
            orderBy: { updatedAt: 'desc' }
        });
        res.json(projects);
    }
    catch (error) {
        console.log(error);
        res.status(500).json({ message: error.message });
    }
};
// controller to toogle project publish 
export const togglePublish = async (req, res) => {
    try {
        const userId = req.userId;
        if (!userId) {
            return res.status(401).json({ message: "Unauthorized user" });
        }
        const { projectId } = req.params;
        const project = await prisma.websiteProject.findUnique({
            where: { id: projectId, userId: userId }
        });
        if (!project) {
            return res.status(404).json({ message: "Project not found" });
        }
        await prisma.websiteProject.update({
            where: { id: projectId },
            data: { isPublished: !project.isPublished }
        });
        res.json({ message: project.isPublished ? "UnPublished" : "Published" });
    }
    catch (error) {
        console.log(error);
        res.status(500).json({ message: error.message });
    }
};
// controller to purchase credits
export const purchaseCredits = async (req, res) => {
};
