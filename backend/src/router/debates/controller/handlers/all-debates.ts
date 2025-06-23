;import { Request, Response } from 'express';
import { logger } from '../../../../services/logger';
import { Debates } from '../../../../models/Debate/Debate';

export const getAllDebates = async (req: Request, res: Response) => {
  try {
    logger.info(`Attempt to retrieve finished debates`);
    const finishedDebates = await Debates.find(
      { status: 'completed' },
      {
        _id: 1,
        status: 1,
        modelConfig: 1,
        wandb_metadata: 1,
      }
    ).lean();
    
    res.json({
      success: true,
      finished_debates: finishedDebates,
    });
  } catch (error) {
    logger.error('Get finished debates error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

export const getSingleDebate = async (req: Request, res: Response) => {
  try {
    const { id } = req.query;   
    logger.info(`Attempt to retrieve single debate with ID: ${id}`);
    
    if (!id) {
      return res.status(400).json({
        success: false,
        errors: {
          id: !id ? ['Debate ID is required'] : undefined,
        }
      });
    }    
    const debate = await Debates.findById(id);
    
    if (!debate) {
      return res.status(404).json({
        success: false,
        message: 'Debate not found'
      });
    }
    
    res.json({
      success: true,
      debate: debate,
    });
  } catch (error) {
    logger.error('Get single debate error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
}